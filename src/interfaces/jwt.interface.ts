export interface JwtUser {
    uid: number;
    token: string;
    expiresIn?: number;
    options?: any;
}

export interface AccessToken {
    accessToken: string;
    expire?: number;
    expiresTimeStamp?: number;
}

export interface AdminUser {
    uid: number;
    userName: string;
}
