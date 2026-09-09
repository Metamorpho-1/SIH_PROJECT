import redis
try:
    r = redis.Redis(host='127.0.0.1', port=6379, db=0)
    print("PING:", r.ping())
except Exception as e:
    print("ERROR:", e)
