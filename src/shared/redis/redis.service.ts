import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '../../config';

@Injectable()
export class RedisService {
  private client: any;
  constructor(private readonly configService: ConfigService) {
    const redisConfig = this.configService.redis;
    if (redisConfig.nodes) {
      this.client = new Redis.Cluster(redisConfig.nodes, redisConfig);
    } else {
      this.client = new Redis(redisConfig);
    }
  }

  getClient() {
    return this.client;
  }

  async set(key: string, val: string, seconds?: number): Promise<'OK' | null> {
    if (!seconds) return await this.client.set(key, val);
    return await this.client.set(key, val, 'EX', seconds);
  }

  async get(key: string): Promise<string> {
    if (!key || key === '*') return null;
    return await this.client.get(key);
  }

  async del(keys: string | string[]): Promise<number> {
    if (!keys || keys === '*') return 0;
    if (typeof keys === 'string') keys = [keys];
    return await this.client.del(...keys);
  }

  async ttl(key: string): Promise<number | null> {
    if (!key) return null;
    return await this.client.ttl(key);
  }

  async hset(key: string, field: string, value: string): Promise<string | number | null> {
    if (!key || !field) return null;
    return await this.client.hset(key, field, value);
  }

  async hmset(key: string, data: any, expire?: number): Promise<number | any> {
    if (!key || !data) return 0;
    const result = await this.client.hmset(key, data);
    if (expire) {
      await this.client.expire(key, expire);
    }
    return result;
  }

  async hget(key: string, field: string): Promise<number | string | null> {
    if (!key || !field) return 0;
    return await this.client.hget(key, field);
  }

  async hvals(key: string): Promise<string[]> {
    if (!key) return [];
    return await this.client.hvals(key);
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    return await this.client.hgetall(key);
  }

  async hdel(key: string, fields: string | string[]): Promise<string[] | number> {
    if (!key || fields.length === 0) return 0;
    return await this.client.hdel(key, ...fields);
  }

  async hdelAll(key: string): Promise<string[] | number> {
    if (!key) return 0;
    const fields = await this.client.hkeys(key);
    if (fields.length === 0) return 0;
    return await this.hdel(key, fields);
  }

  async lLength(key: string): Promise<number> {
    if (!key) return 0;
    return await this.client.llen(key);
  }

  async lSet(key: string, index: number, val: string): Promise<'OK' | null> {
    if (!key || index < 0) return null;
    return await this.client.lset(key, index, val);
  }

  async lIndex(key: string, index: number): Promise<string | null> {
    if (!key || index < 0) return null;
    return await this.client.lindex(key, index);
  }

  async lRange(key: string, start: number, stop: number): Promise<string[] | null> {
    if (!key) return null;
    return await this.client.lrange(key, start, stop);
  }

  async lLeftPush(key: string, ...val: string[]): Promise<number> {
    if (!key) return 0;
    return await this.client.lpush(key, ...val);
  }

  async lpush(key: string, val: string): Promise<number> {
    if (!key) return 0;
    return await this.client.lpush(key, val);
  }

  async lpop(key: string, val: string): Promise<string> {
    if (!key) return null;
    return await this.client.lpop(key);
  }

  async lLeftPushIfPresent(key: string, ...val: string[]): Promise<number> {
    if (!key) return 0;
    return await this.client.lpushx(key, ...val);
  }

  async lLeftInsert(key: string, pivot: string, val: string): Promise<number> {
    if (!key || !pivot) return 0;
    return await this.client.linsert(key, 'BEFORE', pivot, val);
  }

  async lRightInsert(key: string, pivot: string, val: string): Promise<number> {
    if (!key || !pivot) return 0;
    return await this.client.linsert(key, 'AFTER', pivot, val);
  }

  async lRightPush(key: string, ...val: string[]): Promise<number> {
    if (!key) return 0;
    return await this.client.lpush(key, ...val);
  }

  async lRightPushIfPresent(key: string, ...val: string[]): Promise<number> {
    if (!key) return 0;
    return await this.client.rpushx(key, ...val);
  }

  async lLeftPop(key: string): Promise<string> {
    if (!key) return null;
    const result = await this.client.blpop(key);
    return result.length > 0 ? result[0] : null;
  }

  async lRightPop(key: string): Promise<string> {
    if (!key) return null;
    const result = await this.client.brpop(key);
    return result.length > 0 ? result[0] : null;
  }

  async lTrim(key: string, start: number, stop: number): Promise<'OK' | null> {
    if (!key) return null;
    return await this.client.ltrim(key, start, stop);
  }

  async lRemove(key: string, count: number, val: string): Promise<number> {
    if (!key) return 0;
    return await this.client.lrem(key, count, val);
  }

  async lPoplPush(sourceKey: string, destinationKey: string, timeout: number): Promise<string> {
    if (!sourceKey || !destinationKey) return null;
    return await this.client.brpoplpush(sourceKey, destinationKey, timeout);
  }

  async withLock(key: string, value: string | number, expireTime?: number): Promise<'OK' | null> {
    if (!expireTime) {
      return await this.client.set(key, value, 'NX');
    }
    return await this.client.set(key, value, 'EX', expireTime, 'NX');
  }
}
