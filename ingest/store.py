"""Where the scheduled job keeps its files between runs.

KVStore: Cloudflare Workers KV, read by the website's Worker (the namespace id comes from wrangler.jsonc).
LocalStore: a folder (data/store), for running everything on your own computer.
"""
import json
import os
import re
import time
import uuid
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from common import DATA, ROOT


def kv_namespace_id():
    """The DATA namespace id from wrangler.jsonc (comments stripped)."""
    text = open(os.path.join(ROOT, 'wrangler.jsonc')).read()
    text = re.sub(r'^\s*//.*$', '', text, flags=re.M)
    cfg = json.loads(text)
    for ns in cfg.get('kv_namespaces', []):
        if ns.get('binding') == 'DATA':
            return ns['id']
    raise SystemExit('No DATA namespace in wrangler.jsonc.')


class KVStore:
    API = 'https://api.cloudflare.com/client/v4/accounts/{acct}/storage/kv/namespaces/{ns}/values/{key}'

    def __init__(self, account, token, namespace):
        self.account, self.token, self.namespace = account, token, namespace

    def _req(self, method, key, body=None, ctype='application/octet-stream'):
        url = self.API.format(acct=self.account, ns=self.namespace, key=key)
        headers = {'Authorization': f'Bearer {self.token}'}
        if body is not None:
            headers['Content-Type'] = ctype
        for attempt in range(4):
            try:
                with urlopen(Request(url, data=body, method=method, headers=headers), timeout=60) as r:
                    return r.read()
            except HTTPError as e:
                if e.code == 404 and method == 'GET':
                    return None
                if e.code in (401, 403):
                    raise SystemExit(f'Cloudflare refused the API token (HTTP {e.code}). It needs "Workers KV Storage: Edit".')
                if attempt == 3 or (400 <= e.code < 500 and e.code != 429):   # a bad request won't improve on retry
                    raise
            time.sleep(2 ** attempt)

    def get(self, key):
        return self._req('GET', key)

    def put(self, key, body, ctype='application/octet-stream', metadata=None):
        """Save a value. metadata: a small dict stored with it in the same write (the Worker reads it with
        getWithMetadata, e.g. a version tag for tracker.json), sent as a multipart form as the KV API requires."""
        if metadata is None:
            self._req('PUT', key, body, ctype)
            return
        boundary = uuid.uuid4().hex
        form = b''.join([
            f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n'.encode(),
            json.dumps(metadata, separators=(',', ':')).encode(), b'\r\n',
            f'--{boundary}\r\nContent-Disposition: form-data; name="value"; filename="{os.path.basename(key)}"\r\n'
            f'Content-Type: {ctype}\r\n\r\n'.encode(), body, b'\r\n',
            f'--{boundary}--\r\n'.encode(),
        ])
        try:
            self._req('PUT', key, form, f'multipart/form-data; boundary={boundary}')
        except HTTPError as e:
            if e.code != 400:
                raise
            # never lose the data over its metadata: save it plainly (pages then just miss the version tag)
            print(f'store: KV refused metadata for {key} (HTTP 400: {e.read()[:200]!r}); saved without it')
            self._req('PUT', key, body, ctype)


class LocalStore:
    def __init__(self, folder):
        self.folder = folder
        os.makedirs(folder, exist_ok=True)

    def get(self, key):
        path = os.path.join(self.folder, key)
        return open(path, 'rb').read() if os.path.exists(path) else None

    def put(self, key, body, ctype=None, metadata=None):   # metadata: only kept by KV
        path = os.path.join(self.folder, key)
        os.makedirs(os.path.dirname(path), exist_ok=True)  # keys like hist/hh/2026-09.json
        with open(path + '.tmp', 'wb') as f:
            f.write(body)
        os.replace(path + '.tmp', path)


def open_store():
    acct, token = os.environ.get('CF_ACCOUNT_ID'), os.environ.get('CF_API_TOKEN')
    if acct and token:
        return KVStore(acct, token, kv_namespace_id())
    return LocalStore(os.path.join(DATA, 'store'))
