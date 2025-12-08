import * as crypto from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * 配置加密器
 * 使用 AES-256-GCM 算法加密/解密配置
 *
 * 格式：iv:authTag:encryptedData
 * - iv: 初始化向量（16字节）
 * - authTag: 认证标签（16字节）
 * - encryptedData: 加密后的数据
 */
export class ConfigEncryptor {
    private algorithm = 'aes-256-gcm';
    private key: Buffer;
    private logger = new Logger(ConfigEncryptor.name);

    constructor(secretKey: string) {
        // 从密钥生成固定长度的加密key（32字节）
        this.key = crypto.scryptSync(secretKey, 'salt', 32);
    }

    /**
     * 加密配置节点
     * @param data 要加密的数据（任意类型，会被转为JSON）
     * @returns 格式化的加密字符串 "iv:authTag:encryptedData"
     */
    encrypt(data: any): string {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(this.algorithm, this.key, iv) as crypto.CipherGCM;

            const jsonStr = JSON.stringify(data);
            let encrypted = cipher.update(jsonStr, 'utf8', 'base64');
            encrypted += cipher.final('base64');

            const authTag = cipher.getAuthTag();

            // 格式: iv:authTag:encryptedData
            return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
        } catch (error) {
            this.logger.error(`Encryption failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * 解密配置节点
     * @param encryptedData 加密的字符串 "iv:authTag:encryptedData"
     * @returns 解密后的原始数据
     */
    decrypt(encryptedData: string): any {
        try {
            const [ivStr, authTagStr, encrypted] = encryptedData.split(':');

            if (!ivStr || !authTagStr || !encrypted) {
                throw new Error('Invalid encrypted data format, expected "iv:authTag:data"');
            }

            const iv = Buffer.from(ivStr, 'base64');
            const authTag = Buffer.from(authTagStr, 'base64');

            const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv) as crypto.DecipherGCM;
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted, 'base64', 'utf8');
            decrypted += decipher.final('utf8');

            return JSON.parse(decrypted);
        } catch (error) {
            this.logger.error(`Decryption failed: ${error.message}`);
            throw error;
        }
    }
}
