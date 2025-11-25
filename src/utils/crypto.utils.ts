import * as crypto from 'crypto';

const md5 = (data: string, inputEncoding: crypto.Encoding = 'utf-8', encoding: crypto.BinaryToTextEncoding = 'hex') => {
    if (!data) {
        return '';
    }
    const hash = crypto.createHash('md5');
    return hash.update(data, inputEncoding).digest(encoding);
};

const sha1 = (data: string, inputEncoding: crypto.Encoding = 'utf-8', encoding: crypto.BinaryToTextEncoding = 'hex') => {
    if (!data) {
        return '';
    }
    const hash = crypto.createHash('sha1');
    return hash.update(data, inputEncoding).digest(encoding);
};

const hmacSHA1 = (key: string, data: string) => {
    return crypto.createHmac('sha1', key).update(data).digest().toString('base64');
};

const base64Encode = (str: string) => {
    return Buffer.from(str).toString('base64');
};

const base64Decode = (str: string) => {
    return Buffer.from(str, 'base64').toString();
};

// AES encryption/decryption functions
const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32bytes!';
const IV_LENGTH = 16;

const encrypt = (text: string): string => {
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
};

const decrypt = (text: string): string => {
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

export { md5, sha1, hmacSHA1, base64Encode, base64Decode, encrypt, decrypt };
