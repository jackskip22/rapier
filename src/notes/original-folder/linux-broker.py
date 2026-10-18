#!/usr/bin/env python3
"""Linux original-folder broker with checked, same-directory saves.

Only openat2 beneath one pinned root. No path fallbacks, symlinks,
mount crossings or hard-linked files. Descriptor pins defeat inode reuse.
Protocol: bounded JSON lines on stdio; one caller, no network or grants.
"""
import base64
import ctypes
import errno
import fcntl
import hashlib
import json
import os
import platform
import signal
import stat
import sys
import uuid

MAX_PINS = 256
MAX_CURSORS = 4
MAX_ANCHORS = 1024
MAX_READS = 8
MAX_CHUNK = 65536
MAX_REQUEST = 16384
O_PATH = getattr(os, 'O_PATH', 0)
NO_LINKS = 0x02 | 0x04
BENEATH = 0x08 | NO_LINKS | 0x01

class Refusal(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code

class OpenHow(ctypes.Structure):
    _fields_ = [('flags', ctypes.c_uint64), ('mode', ctypes.c_uint64),
                ('resolve', ctypes.c_uint64)]

libc = ctypes.CDLL(None, use_errno=True)
libc.syscall.restype = ctypes.c_long
# Linux's generic and x86-64 syscall tables both assign openat2 number 437.
if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'aarch64') or not O_PATH:
    raise RuntimeError('openat2 witness requires Linux x86_64/aarch64')


def openat2(parent, path, flags, resolve=BENEATH):
    how = OpenHow(flags | os.O_CLOEXEC, 0, resolve)
    fd = libc.syscall(437, ctypes.c_int(parent), ctypes.c_char_p(os.fsencode(path)),
                      ctypes.byref(how), ctypes.sizeof(how))
    if fd < 0:
        e = ctypes.get_errno()
        raise OSError(e, os.strerror(e))
    return fd


def identity(s):
    return (s.st_dev, s.st_ino)


def require_local_filesystem(fd):
    # Linux 64-bit statfs begins with a long f_type. Unknown, network and user-space
    # filesystems are not admitted by this local-kernel contract (notably NFS O_EXCL).
    info = (ctypes.c_long * 32)()
    if libc.fstatfs(fd, ctypes.byref(info)) != 0 or info[0] not in (
            0xEF53, 0x58465342, 0x9123683E, 0x01021994, 0x794C7630):
        raise Refusal('filesystem_guarantee_unavailable')


def version(s):
    return ':'.join(str(v) for v in (s.st_dev, s.st_ino, s.st_size,
                                     s.st_mtime_ns, s.st_ctime_ns, s.st_nlink))


def pathcheck(path):
    if not isinstance(path, str) or len(path.encode('utf-8')) > 8192:
        raise Refusal('invalid_path')
    if path == '':
        return '.'
    parts = path.split('/')
    if len(parts) > 64 or any(not p or p in ('.', '..') or '\\' in p or
                             '\0' in p or len(p.encode('utf-8')) > 255 for p in parts):
        raise Refusal('invalid_path')
    return path


class Broker:
    def __init__(self, root):
        self.root_path = os.path.abspath(root)
        self.root_fd = openat2(-100, self.root_path, O_PATH | os.O_DIRECTORY, NO_LINKS)
        try:
            require_local_filesystem(self.root_fd)
        except BaseException:
            os.close(self.root_fd)
            raise
        self.root_identity = identity(os.fstat(self.root_fd))
        self.pins = {}
        self.cursors = {}
        self.reads = {}
        self.writes = {}
        self.anchors = 0
        self.serial = 0
        self.metrics = dict(metadata=0, entries=0, bodyReads=0, bodyBytes=0,
                            writes=0, pinsPeak=0, cursorsPeak=0, chunkPeak=0)
        self.root = self.pin('', os.dup(self.root_fd))
        self.root['name'] = os.path.basename(self.root_path) or '/'
        signal.signal(signal.SIGIO, self.break_reads)

    def break_reads(self, *_):
        # A pending open/truncate must never wait for the renderer. Once broken,
        # none of the bytes collected by that read can be admitted.
        for read in list(self.reads.values()):
            read['broken'] = True
            try:
                fcntl.fcntl(read['fd'], fcntl.F_SETLEASE, fcntl.F_UNLCK)
            except OSError:
                pass

    def new_id(self):
        self.serial += 1
        return str(self.serial)

    def check_root(self):
        # Display-path replacement invalidates the binding, but never drives
        # descendant access: all opens below use the original root descriptor.
        fd = openat2(-100, self.root_path, O_PATH | os.O_DIRECTORY, NO_LINKS)
        try:
            if identity(os.fstat(fd)) != self.root_identity:
                raise Refusal('stale_root')
        finally:
            os.close(fd)

    def stat(self, fd):
        self.metrics['metadata'] += 1
        return os.fstat(fd)

    def pin(self, path, fd):
        parents = []
        try:
            if len(self.pins) >= MAX_PINS:
                raise Refusal('pin_limit')
            s = self.stat(fd)
            if stat.S_ISDIR(s.st_mode):
                kind = 'directory'
            elif stat.S_ISREG(s.st_mode):
                if s.st_nlink != 1:
                    raise Refusal('hardlink_refused')
                kind = 'file'
            else:
                raise Refusal('unsupported_entry')
            components = path.split('/')[:-1] if path else []
            if self.anchors + len(components) > MAX_ANCHORS:
                raise Refusal('pin_limit')
            parent = self.root_fd
            for name in components:
                parent = openat2(parent, name, O_PATH | os.O_DIRECTORY)
                parents.append(parent)
            if path:
                current = openat2(parent, path.rsplit('/', 1)[-1], O_PATH)
                try:
                    if identity(self.stat(current)) != identity(s):
                        raise Refusal('stale_locator')
                finally:
                    os.close(current)
            key = self.new_id()
            self.pins[key] = (path, fd, tuple(parents))
            self.anchors += len(parents)
            self.metrics['pinsPeak'] = max(self.metrics['pinsPeak'], len(self.pins))
            return dict(id=key, name=path.rsplit('/', 1)[-1], displayPath=path,
                        kind=kind, size=s.st_size, version=version(s))
        except BaseException:
            for parent in parents:
                os.close(parent)
            os.close(fd)
            raise

    def get(self, key):
        if key not in self.pins:
            raise Refusal('stale_locator')
        return self.pins[key]

    def checked_fd(self, pin, flags=O_PATH):
        path, anchor = pin[:2]
        parent = self.checked_parent(pin)
        fd = openat2(parent, (path.rsplit('/', 1)[-1] if path else '.') if len(pin) > 2 else pathcheck(path), flags)
        try:
            actual, expected = self.stat(fd), self.stat(anchor)
            if identity(actual) != identity(expected):
                raise Refusal('stale_locator')
            if stat.S_ISREG(actual.st_mode) and actual.st_nlink != 1:
                raise Refusal('hardlink_refused')
            return fd
        except BaseException:
            os.close(fd)
            raise

    def checked_parent(self, pin):
        self.check_root()
        path = pin[0]
        parents = pin[2] if len(pin) > 2 else ()
        parent = self.root_fd
        for name, held in zip(path.split('/')[:-1], parents):
            current = openat2(parent, name, O_PATH | os.O_DIRECTORY)
            try:
                if identity(self.stat(current)) != identity(self.stat(held)):
                    raise Refusal('stale_locator')
            finally:
                os.close(current)
            parent = held
        return parent

    def validate(self, key):
        fd = self.checked_fd(self.get(key))
        try:
            s = self.stat(fd)
            return dict(size=s.st_size, version=version(s))
        finally:
            os.close(fd)

    def lookup(self, path):
        self.check_root()
        pathcheck(path)
        return self.pin(path, openat2(self.root_fd, pathcheck(path), O_PATH))

    def relative(self, key, path):
        source = self.get(key)
        os.close(self.checked_fd(source))
        parts = pathcheck(path).split('/')
        origin = source[0].split('/')[:-1]
        common = 0
        while common < min(len(origin), len(parts) - 1) and origin[common] == parts[common]:
            common += 1
        parent = source[2][common - 1] if common else self.root_fd
        fd = openat2(parent, '/'.join(parts[common:]), O_PATH)
        row = self.pin(path, fd)
        try:
            # The source's parent and the new row's common ancestry must be the
            # same descriptors' objects, even if the file was moved between them.
            target = self.get(row['id'])
            for a, b in zip(source[2][:common], target[2][:common]):
                if identity(self.stat(a)) != identity(self.stat(b)):
                    raise Refusal('stale_locator')
            os.close(self.checked_fd(source))
            return row
        except BaseException:
            self.release(row['id'])
            raise

    def retain(self, key):
        pin = self.get(key)
        return self.pin(pin[0], self.checked_fd(pin))

    def release(self, key):
        pin = self.pins.pop(key, None)
        if pin:
            for parent in pin[2]:
                os.close(parent)
            self.anchors -= len(pin[2])
            os.close(pin[1])
        return True

    def read_start(self, key):
        if len(self.reads) >= MAX_READS:
            raise Refusal('read_limit')
        pin = self.get(key)
        fd = self.checked_fd(pin, os.O_RDONLY | os.O_NONBLOCK)
        try:
            before = self.stat(fd)
            if not stat.S_ISREG(before.st_mode):
                raise Refusal('not_file')
            token = self.new_id()
            self.reads[token] = dict(fd=fd, pin=pin, broken=False, version=version(before))
            try:
                fcntl.fcntl(fd, fcntl.F_SETLEASE, fcntl.F_RDLCK)
            except OSError as error:
                raise Refusal('changed_during_read' if error.errno == errno.EAGAIN else 'coherent_snapshot_unavailable') from error
            return dict(read=token, size=before.st_size, version=version(before))
        except BaseException:
            if 'token' in locals():
                self.reads.pop(token, None)
            os.close(fd)
            raise

    def read_close(self, token):
        read = self.reads.pop(token, None)
        if read:
            os.close(read['fd'])
        return True

    def read_chunk(self, token, offset, length):
        read = self.reads.get(token)
        if not read:
            raise Refusal('stale_read')
        if not isinstance(offset, int) or offset < 0 or not isinstance(length, int) or not 0 <= length <= MAX_CHUNK:
            raise Refusal('invalid_range')
        def current():
            if read['broken'] or fcntl.fcntl(read['fd'], fcntl.F_GETLEASE) != fcntl.F_RDLCK:
                raise Refusal('changed_during_read')
            if version(self.stat(read['fd'])) != read['version']:
                raise Refusal('changed_during_read')
            os.close(self.checked_fd(read['pin']))
        current()
        data = os.pread(read['fd'], length, offset)
        current()
        self.metrics['bodyReads'] += 1
        self.metrics['bodyBytes'] += len(data)
        self.metrics['chunkPeak'] = max(self.metrics['chunkPeak'], len(data))
        return dict(data=base64.b64encode(data).decode('ascii'), version=read['version'])

    def list_start(self, key):
        if len(self.cursors) >= MAX_CURSORS:
            raise Refusal('cursor_limit')
        pin = self.get(key)
        fd = self.checked_fd(pin, os.O_RDONLY | os.O_DIRECTORY)
        try:
            cursor = self.new_id()
            self.cursors[cursor] = dict(pin=(pin[0], fd), it=os.scandir(fd),
                                        version=version(self.stat(fd)))
            self.metrics['cursorsPeak'] = max(self.metrics['cursorsPeak'], len(self.cursors))
            return cursor
        except BaseException:
            os.close(fd)
            raise

    def list_close(self, cursor):
        state = self.cursors.pop(cursor, None)
        if state:
            state['it'].close()
            os.close(state['pin'][1])
        return True

    def list_next(self, cursor, limit):
        if not isinstance(limit, int) or not 1 <= limit <= 128:
            raise Refusal('invalid_limit')
        state = self.cursors.get(cursor)
        if not state:
            raise Refusal('stale_cursor')
        entries, skipped = [], 0
        try:
            def current():
                fd = self.checked_fd(state['pin'], os.O_RDONLY | os.O_DIRECTORY)
                try:
                    if version(self.stat(fd)) != state['version']:
                        raise Refusal('listing_changed')
                finally:
                    os.close(fd)
            current()
            done = False
            for _ in range(limit):
                entry = next(state['it'], None)
                if entry is None:
                    done = True
                    break
                # Count an unadmitted entry without hiding its safe siblings.
                # Invalid names are never converted into lossy display aliases.
                try:
                    entry.name.encode('utf-8', 'strict')
                    path = '/'.join(filter(None, (state['pin'][0], entry.name)))
                    row = self.lookup(path)
                except (Refusal, OSError, UnicodeError) as error:
                    if not (isinstance(error, UnicodeError) or getattr(error, 'errno', None) == errno.ELOOP or
                            getattr(error, 'code', None) in ('unsupported_entry', 'hardlink_refused', 'invalid_path')):
                        raise
                    skipped += 1
                    continue
                entries.append(row)
                if self.stat(self.get(row['id'])[1]).st_ino != entry.inode():
                    raise Refusal('listing_changed')
                self.metrics['entries'] += 1
            current()
            if done:
                self.list_close(cursor)
            return dict(entries=entries, done=done, skipped=skipped)
        except BaseException:
            for row in entries:
                self.release(row['id'])
            self.list_close(cursor)
            raise

    def write_start(self, key, size, expected, digest):
        if len(self.writes) >= 4 or not isinstance(size, int) or not 0 <= size <= 64 * 1024 * 1024:
            raise Refusal('write_limit')
        if sum(w['size'] for w in self.writes.values()) + size > 64 * 1024 * 1024:
            raise Refusal('write_limit')
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
            raise Refusal('invalid_snapshot')
        if (not isinstance(expected, dict) or not isinstance(expected.get('size'), int)
                or not isinstance(expected.get('version'), str) or len(expected['version']) > 256
                or not isinstance(expected.get('digest'), str) or len(expected['digest']) != 64
                or any(c not in '0123456789abcdef' for c in expected['digest'])):
            raise Refusal('invalid_snapshot')
        pin = self.get(key)
        parent = self.checked_parent(pin)
        parent = openat2(parent, '.', os.O_RDONLY | os.O_DIRECTORY)
        name = '.rapier-save-' + uuid.uuid4().hex + '.tmp'
        try:
            fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=parent)
        except BaseException:
            os.close(parent)
            raise
        token = self.new_id()
        self.writes[token] = dict(pin=pin, parent=parent, stage=name, fd=fd, size=size, offset=0, expected=expected, digest=digest)
        return token

    def write_chunk(self, token, offset, data):
        w = self.writes.get(token)
        if not w: raise Refusal('stale_write')
        chunk = base64.b64decode(data, validate=True)
        if offset != w['offset'] or not 0 < len(chunk) <= 8192 or offset + len(chunk) > w['size']:
            raise Refusal('invalid_range')
        at = 0
        while at < len(chunk):
            n = os.write(w['fd'], chunk[at:])
            if n <= 0: raise Refusal('write_incomplete')
            at += n
        w['offset'] += len(chunk)
        return w['offset']

    def write_close(self, token):
        w = self.writes.pop(token, None)
        if w:
            try:
                if w['stage']:
                    try:
                        if identity(os.stat(w['stage'], dir_fd=w['parent'], follow_symlinks=False)) == identity(self.stat(w['fd'])):
                            os.unlink(w['stage'], dir_fd=w['parent'])
                    except FileNotFoundError: pass
            finally:
                os.close(w['fd']); os.close(w['parent'])
        return True

    @staticmethod
    def digest_fd(fd, size):
        digest = hashlib.sha256()
        for at in range(0, size, MAX_CHUNK):
            data = os.pread(fd, min(MAX_CHUNK, size - at), at)
            if len(data) != min(MAX_CHUNK, size - at): raise Refusal('changed_during_read')
            digest.update(data)
        return digest.hexdigest()

    def write_finish(self, token):
        w = self.writes.get(token)
        if not w or w['offset'] != w['size']: raise Refusal('write_incomplete')
        pin, parent, expected = w['pin'], w['parent'], w['expected']
        if identity(self.stat(self.checked_parent(pin))) != identity(self.stat(parent)):
            raise Refusal('stale_locator')
        os.fsync(w['fd'])
        intended = w['digest']
        def verify_stage():
            current = os.stat(w['stage'], dir_fd=parent, follow_symlinks=False)
            if identity(current) != identity(self.stat(w['fd'])) or current.st_size != w['size'] or self.digest_fd(w['fd'], w['size']) != intended:
                raise Refusal('stage_changed')
        verify_stage()
        matched, mode = False, 0o600
        try:
            fd = self.checked_fd(pin, os.O_RDONLY | os.O_NONBLOCK)
            try:
                before = self.stat(fd)
                if stat.S_ISREG(before.st_mode) and before.st_size == expected['size'] and version(before) == expected['version']:
                    mode = stat.S_IMODE(before.st_mode) & 0o777
                    os.fchmod(w['fd'], mode)
                    os.fsync(w['fd'])
                    matched = self.digest_fd(fd, before.st_size) == expected['digest'] and version(self.stat(fd)) == expected['version']
                if matched:
                    # This is a desktop-editor check immediately before replacement, not filesystem CAS.
                    os.close(self.checked_fd(pin))
                    matched = version(self.stat(fd)) == expected['version']
            finally: os.close(fd)
        except (OSError, Refusal):
            matched = False
        name = pin[0].rsplit('/', 1)[-1]
        if matched and intended == expected['digest'] and w['size'] == expected['size']:
            return dict(status='unchanged', metadata=self.validate(next(k for k, p in self.pins.items() if p is pin)))
        # Never follow a changed parent, even when the draft needs a sibling copy.
        if identity(self.stat(self.checked_parent(pin))) != identity(self.stat(parent)):
            raise Refusal('stale_locator')
        verify_stage()
        if matched:
            # Recheck metadata after staging its permissions and flushing the complete bytes.
            try: matched = self.validate(next(k for k, p in self.pins.items() if p is pin))['version'] == expected['version']
            except (OSError, Refusal): matched = False
        if matched:
            os.replace(w['stage'], name, src_dir_fd=parent, dst_dir_fd=parent)
        else:
            stem, extension = os.path.splitext(name)
            for number in range(1, 1000):
                name = stem + (' (edited)' if number == 1 else ' (edited ' + str(number) + ')') + extension
                try:
                    os.link(w['stage'], name, src_dir_fd=parent, dst_dir_fd=parent, follow_symlinks=False)
                    os.unlink(w['stage'], dir_fd=parent)
                    break
                except FileExistsError: continue
            else: raise Refusal('copy_name_limit')
        w['stage'] = None
        os.fsync(parent)
        self.metrics['writes'] += 1
        fd = openat2(parent, name, os.O_RDONLY | os.O_NONBLOCK)
        try:
            s = self.stat(fd)
            if identity(s) != identity(self.stat(w['fd'])) or s.st_size != w['size'] or self.digest_fd(fd, s.st_size) != intended:
                raise Refusal('write_unverified')
            metadata = dict(size=s.st_size, version=version(s))
        finally: os.close(fd)
        self.checked_parent(pin)
        if not matched: return dict(status='kept-both', destinationName=name)
        row = self.lookup(pin[0])
        return dict(status='saved', row=row, metadata=metadata, destinationName=name)

    def close(self):
        for key in list(self.writes):
            self.write_close(key)
        for key in list(self.reads):
            self.read_close(key)
        for key in list(self.cursors):
            self.list_close(key)
        for key in list(self.pins):
            self.release(key)
        os.close(self.root_fd)

    def dispatch(self, method, args):
        if method == 'hello':
            return dict(root=self.root, capabilities=dict(conditionalCommit=False, checkedSave=True,
                        verifiedWriteBack=True, pinnedIdentity=True, confinedRead=True,
                        coherentRead=True, parentAnchored=True, boundedEnumeration=True, provider='linux'),
                        platform=platform.platform())
        if method == 'lookup': return self.lookup(args['path'])
        if method == 'relative': return self.relative(args['id'], args['path'])
        if method == 'retain':
            if not args.get('forSave'): return self.retain(args['id'])
            pin = self.get(args['id'])
            self.checked_parent(pin)
            if len(self.pins) >= MAX_PINS or self.anchors + len(pin[2]) > MAX_ANCHORS:
                raise Refusal('pin_limit')
            owned = []
            try:
                for fd in (pin[1], *pin[2]): owned.append(os.dup(fd))
            except BaseException:
                for fd in owned: os.close(fd)
                raise
            key = self.new_id()
            self.pins[key] = (pin[0], owned[0], tuple(owned[1:]))
            self.anchors += len(pin[2])
            s = self.stat(owned[0])
            return dict(id=key, name=pin[0].rsplit('/', 1)[-1], displayPath=pin[0], kind='file', size=s.st_size, version=version(s))
        if method == 'release': return [self.release(k) for k in args['ids']]
        if method == 'validate': return self.validate(args['id'])
        if method == 'readStart': return self.read_start(args['id'])
        if method == 'readChunk': return self.read_chunk(args['read'], args['offset'], args['length'])
        if method == 'readClose': return self.read_close(args['read'])
        if method == 'writeStart': return self.write_start(args['id'], args['size'], args['expected'], args['digest'])
        if method == 'writeChunk': return self.write_chunk(args['write'], args['offset'], args['data'])
        if method == 'writeFinish': return self.write_finish(args['write'])
        if method == 'writeClose': return self.write_close(args['write'])
        if method == 'listStart': return self.list_start(args['id'])
        if method == 'listNext': return self.list_next(args['cursor'], args['limit'])
        if method == 'listClose': return self.list_close(args['cursor'])
        if method == 'stats': return dict(self.metrics, pins=len(self.pins), cursors=len(self.cursors),
                                          anchors=self.anchors, reads=len(self.reads))
        raise Refusal('unknown_operation')


ERRORS = {errno.ENOENT: 'missing', errno.EACCES: 'unavailable', errno.EPERM: 'unavailable',
          errno.ENOTDIR: 'stale_locator', errno.ELOOP: 'symlink_refused',
          errno.EXDEV: 'escape_refused', errno.EAGAIN: 'resolution_race',
          errno.ENOSYS: 'openat2_unavailable'}


def main():
    def terminate(_signal, _frame):
        raise SystemExit(0)
    signal.signal(signal.SIGTERM, terminate)
    broker = Broker(sys.argv[1])
    try:
        while True:
            line = sys.stdin.buffer.readline(MAX_REQUEST + 1)
            if not line: break
            if len(line) > MAX_REQUEST: raise Refusal('request_limit')
            request = json.loads(line)
            try:
                result = dict(id=request['id'], value=broker.dispatch(request['method'], request.get('args', {})))
            except (Refusal, OSError, UnicodeError) as error:
                code = error.code if isinstance(error, Refusal) else (
                    ERRORS.get(error.errno, 'unavailable') if isinstance(error, OSError) else 'invalid_name')
                result = dict(id=request['id'], error=code)
            print(json.dumps(result, ensure_ascii=True, separators=(',', ':')), flush=True)
    finally:
        broker.close()

if __name__ == '__main__':
    main()

