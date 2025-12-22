import { Test, TestingModule } from '@nestjs/testing';
import { ConfigLoaderService } from './config-loader.service';
import { ConfigEncryptor } from '../encryption/config-encryptor.service';
import { Logger } from '@nestjs/common';

describe('ConfigLoaderService - Merge Strategies', () => {
    let service: ConfigLoaderService;
    let mockEncryptor: jest.Mocked<ConfigEncryptor>;

    beforeEach(async () => {
        mockEncryptor = {
            decrypt: jest.fn((value) => value),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ConfigLoaderService,
                {
                    provide: ConfigEncryptor,
                    useValue: mockEncryptor,
                },
                Logger,
            ],
        }).compile();

        service = module.get<ConfigLoaderService>(ConfigLoaderService);
    });

    describe('Mode: replace (default)', () => {
        it('should completely replace arrays by default', () => {
            const common = {
                servers: {
                    servers: [
                        { host: 's1.com', port: 8080 },
                        { host: 's2.com', port: 8080 },
                    ],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@servers'],
                    'servers': [{ host: 's3.com', port: 9090 }],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.test.servers).toEqual([{ host: 's3.com', port: 9090 }]);
        });

        it('should replace arrays when mode is explicitly set to replace', () => {
            const common = {
                servers: {
                    servers: [
                        { host: 's1.com', port: 8080 },
                        { host: 's2.com', port: 8080 },
                    ],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@servers'],
                    '@merge': {
                        'servers': { mode: 'replace' },
                    },
                    'servers': [{ host: 's3.com', port: 9090 }],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.test.servers).toEqual([{ host: 's3.com', port: 9090 }]);
        });
    });

    describe('Mode: merge (by index)', () => {
        it('should merge array elements by index, preserving unspecified fields', () => {
            const common = {
                db: {
                    replication: {
                        slaves: [
                            { host: 'slave1.com', port: 3306, user: 'readonly', database: 'common_db' },
                            { host: 'slave2.com', port: 3306, user: 'readonly', database: 'common_db' },
                        ],
                    },
                },
            };

            const serviceConfig = {
                wallet: {
                    '@import': ['@db'],
                    '@merge': {
                        'replication.slaves': { mode: 'merge' },
                    },
                    'replication.slaves': [
                        { database: 'dragon_wallet', password: 'secret123' },
                        { database: 'dragon_wallet', password: 'secret456' },
                    ],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.wallet.replication.slaves).toEqual([
                { host: 'slave1.com', port: 3306, user: 'readonly', database: 'dragon_wallet', password: 'secret123' },
                { host: 'slave2.com', port: 3306, user: 'readonly', database: 'dragon_wallet', password: 'secret456' },
            ]);
        });

        it('should add new elements when source is longer than target', () => {
            const common = {
                servers: {
                    list: [{ host: 's1.com', port: 8080 }],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@servers'],
                    '@merge': {
                        'list': { mode: 'merge' },
                    },
                    'list': [
                        { host: 's1-override.com' },
                        { host: 's2.com', port: 9090 },
                        { host: 's3.com', port: 9090 },
                    ],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.test.list).toEqual([
                { host: 's1-override.com', port: 8080 },
                { host: 's2.com', port: 9090 },
                { host: 's3.com', port: 9090 },
            ]);
        });

        it('should preserve extra target elements when source is shorter', () => {
            const common = {
                servers: {
                    list: [
                        { host: 's1.com', port: 8080 },
                        { host: 's2.com', port: 8080 },
                        { host: 's3.com', port: 8080 },
                    ],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@servers'],
                    '@merge': {
                        'list': { mode: 'merge' },
                    },
                    'list': [{ host: 's1-override.com' }],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.test.list).toEqual([
                { host: 's1-override.com', port: 8080 },
                { host: 's2.com', port: 8080 },
                { host: 's3.com', port: 8080 },
            ]);
        });
    });

    describe('Mode: append', () => {
        it('should append source array to target array', () => {
            const common = {
                servers: {
                    list: [
                        { name: 'server1', host: 's1.com' },
                        { name: 'server2', host: 's2.com' },
                    ],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@servers'],
                    '@merge': {
                        'list': { mode: 'append' },
                    },
                    'list': [{ name: 'server3', host: 's3.com' }],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.test.list).toEqual([
                { name: 'server1', host: 's1.com' },
                { name: 'server2', host: 's2.com' },
                { name: 'server3', host: 's3.com' },
            ]);
        });

        it('should not deduplicate appended elements', () => {
            const common = {
                servers: {
                    list: [{ name: 'server1' }],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@servers'],
                    '@merge': {
                        'list': { mode: 'append' },
                    },
                    'list': [{ name: 'server1' }, { name: 'server2' }],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.test.list).toHaveLength(3);
            expect(result.test.list[0]).toEqual({ name: 'server1' });
            expect(result.test.list[1]).toEqual({ name: 'server1' });
        });
    });

    describe('Mode: patch (by key)', () => {
        it('should merge array elements by matching key field', () => {
            const common = {
                payment: {
                    channels: [
                        { channelCode: 'alipay', appId: 'common_app', enabled: true },
                        { channelCode: 'wechat', appId: 'common_app', enabled: true },
                        { channelCode: 'unionpay', appId: 'common_app', enabled: false },
                    ],
                },
            };

            const serviceConfig = {
                wallet: {
                    '@import': ['@payment'],
                    '@merge': {
                        'channels': { mode: 'patch', arrayMergeBy: 'channelCode' },
                    },
                    'channels': [
                        { channelCode: 'alipay', appId: 'wallet_app', secretKey: 'xxx' },
                        { channelCode: 'wechat', enabled: false },
                        { channelCode: 'stripe', appId: 'stripe_app', enabled: true },
                    ],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.wallet.channels).toEqual([
                { channelCode: 'alipay', appId: 'wallet_app', enabled: true, secretKey: 'xxx' },
                { channelCode: 'wechat', appId: 'common_app', enabled: false },
                { channelCode: 'unionpay', appId: 'common_app', enabled: false },
                { channelCode: 'stripe', appId: 'stripe_app', enabled: true },
            ]);
        });

        it('should append new items when key not found in target', () => {
            const common = {
                items: {
                    list: [
                        { id: 1, name: 'item1' },
                        { id: 2, name: 'item2' },
                    ],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@items'],
                    '@merge': {
                        'list': { mode: 'patch', arrayMergeBy: 'id' },
                    },
                    'list': [
                        { id: 1, value: 100 },
                        { id: 3, name: 'item3', value: 300 },
                    ],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.test.list).toEqual([
                { id: 1, name: 'item1', value: 100 },
                { id: 2, name: 'item2' },
                { id: 3, name: 'item3', value: 300 },
            ]);
        });

        it('should warn and skip items without key field', () => {
            const loggerWarnSpy = jest.spyOn(service['logger'], 'warn');

            const common = {
                items: {
                    list: [{ id: 1, name: 'item1' }],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@items'],
                    '@merge': {
                        'list': { mode: 'patch', arrayMergeBy: 'id' },
                    },
                    'list': [
                        { id: 1, value: 100 },
                        { name: 'no-id-item' }, // Missing 'id' field
                    ],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(loggerWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining("Source item missing key field 'id'"),
            );
            expect(result.test.list).toEqual([{ id: 1, name: 'item1', value: 100 }]);
        });

        it('should fallback to replace if arrayMergeBy not specified', () => {
            const loggerWarnSpy = jest.spyOn(service['logger'], 'warn');

            const common = {
                items: {
                    list: [{ id: 1 }, { id: 2 }],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@items'],
                    '@merge': {
                        'list': { mode: 'patch' }, // Missing arrayMergeBy
                    },
                    'list': [{ id: 3 }],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(loggerWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('patch mode requires arrayMergeBy'),
            );
            expect(result.test.list).toEqual([{ id: 3 }]); // Replaced
        });
    });

    describe('Mode: shallow (for objects)', () => {
        it('should only merge first level properties', () => {
            const common = {
                redis: {
                    config: {
                        host: 'common-redis',
                        port: 6379,
                        options: {
                            maxRetriesPerRequest: 3,
                            enableReadyCheck: true,
                            connectTimeout: 5000,
                        },
                    },
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@redis'],
                    '@merge': {
                        'config': { mode: 'shallow' },
                    },
                    'config': {
                        host: 'service-redis',
                        options: {
                            enableReadyCheck: false,
                        },
                    },
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            // Shallow merge: port is lost, options is completely replaced
            expect(result.test.config).toEqual({
                host: 'service-redis',
                options: {
                    enableReadyCheck: false,
                },
            });
        });

        it('should preserve deep merge for nested objects without shallow mode', () => {
            const common = {
                redis: {
                    config: {
                        host: 'common-redis',
                        port: 6379,
                        options: {
                            maxRetriesPerRequest: 3,
                            enableReadyCheck: true,
                        },
                    },
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@redis'],
                    // No @merge, using default deep merge
                    'config': {
                        host: 'service-redis',
                        options: {
                            enableReadyCheck: false,
                        },
                    },
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            // Deep merge: all properties preserved
            expect(result.test.config).toEqual({
                host: 'service-redis',
                port: 6379,
                options: {
                    maxRetriesPerRequest: 3,
                    enableReadyCheck: false,
                },
            });
        });
    });

    describe('Multiple merge strategies', () => {
        it('should apply different strategies to different paths', () => {
            const common = {
                multi: {
                    database: {
                        slaves: [
                            { host: 'slave1', port: 3306 },
                            { host: 'slave2', port: 3306 },
                        ],
                    },
                    payment: {
                        channels: [
                            { code: 'alipay', enabled: true },
                            { code: 'wechat', enabled: true },
                        ],
                    },
                    servers: [{ name: 'server1' }],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@multi'],
                    '@merge': {
                        'database.slaves': { mode: 'merge' },
                        'payment.channels': { mode: 'patch', arrayMergeBy: 'code' },
                        'servers': { mode: 'append' },
                    },
                    'database.slaves': [{ port: 3307 }],
                    'payment.channels': [{ code: 'alipay', enabled: false }],
                    'servers': [{ name: 'server2' }],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.test.database.slaves).toEqual([
                { host: 'slave1', port: 3307 },
                { host: 'slave2', port: 3306 },
            ]);

            expect(result.test.payment.channels).toEqual([
                { code: 'alipay', enabled: false },
                { code: 'wechat', enabled: true },
            ]);

            expect(result.test.servers).toEqual([{ name: 'server1' }, { name: 'server2' }]);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty arrays', () => {
            const common = {
                test: {
                    list: [{ id: 1 }],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@test'],
                    '@merge': {
                        'list': { mode: 'merge' },
                    },
                    'list': [],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.test.list).toEqual([{ id: 1 }]);
        });

        it('should handle undefined target', () => {
            const common = {};

            const serviceConfig = {
                test: {
                    '@import': ['@test'],
                    '@merge': {
                        'list': { mode: 'merge' },
                    },
                    'list': [{ id: 1 }],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.test.list).toEqual([{ id: 1 }]);
        });

        it('should handle non-object array elements', () => {
            const common = {
                test: {
                    tags: ['tag1', 'tag2'],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@test'],
                    '@merge': {
                        'tags': { mode: 'append' },
                    },
                    'tags': ['tag3'],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            expect(result.test.tags).toEqual(['tag1', 'tag2', 'tag3']);
        });
    });

    describe('Backward compatibility', () => {
        it('should not affect configs without @merge directive', () => {
            const common = {
                servers: {
                    list: [{ host: 's1.com' }, { host: 's2.com' }],
                },
            };

            const serviceConfig = {
                test: {
                    '@import': ['@servers'],
                    'list': [{ host: 's3.com' }],
                },
            };

            const result = service.loadConfig(serviceConfig, common);

            // Default behavior: array replacement
            expect(result.test.list).toEqual([{ host: 's3.com' }]);
        });
    });
});
