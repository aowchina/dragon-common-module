export class BaseConfig {
    constructor(public name = 'base') {}

    makeConfig(config) {
        for (const key in config) {
            if (config.hasOwnProperty(key)) {
                this[key] = config[key];
            }
        }
    }

    randValue(item: object, key: string, containRandom: string = 'random') {
        if (!item || !item[key]) {
            return;
        }
        let value = item[key];
        if (value.includes(`${containRandom}%`)) {
            value = value.replace('%random%', Math.random().toString(36).substr(2, 9));
        }
        item[key] = value;
    }
}
