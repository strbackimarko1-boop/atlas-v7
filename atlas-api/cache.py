"""
ATLAS API — Cache Layer
Replaces Streamlit's @st.cache_data with TTL-based caching.
Thread-safe, key-based, automatic expiry.
"""
import time
import threading
from functools import wraps


class TTLCache:
    """Simple thread-safe TTL cache."""

    def __init__(self):
        self._store = {}
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            if key in self._store:
                value, expiry = self._store[key]
                if time.time() < expiry:
                    return value
                del self._store[key]
        return None

    def set(self, key, value, ttl):
        with self._lock:
            self._store[key] = (value, time.time() + ttl)

    def delete(self, key):
        with self._lock:
            self._store.pop(key, None)

    def clear(self):
        with self._lock:
            self._store.clear()

    def stats(self):
        with self._lock:
            now = time.time()
            total = len(self._store)
            active = sum(1 for _, (_, exp) in self._store.items() if now < exp)
            return {"total_keys": total, "active_keys": active}


# Global cache instance
cache = TTLCache()


def cached(ttl, key_func=None):
    """
    Decorator that caches function results with TTL.

    Usage:
        @cached(ttl=300, key_func=lambda tk, sess: f"score:{tk}:{sess}")
        def score(tk, sess):
            ...

    Or with auto-generated key:
        @cached(ttl=300)
        def get_vix():
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if key_func:
                k = key_func(*args, **kwargs)
            else:
                k = f"{func.__name__}:{str(args)}:{str(kwargs)}"

            result = cache.get(k)
            if result is not None:
                return result

            result = func(*args, **kwargs)
            if result is not None:
                cache.set(k, result, ttl)
            return result
        return wrapper
    return decorator
