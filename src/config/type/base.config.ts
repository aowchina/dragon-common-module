export class BaseConfig {
  constructor(public name = 'base') {}

  makeConfig(config) {
    for (const key in config) {
      if (config.hasOwnProperty(key)) {
        this[key] = config[key];
      }
    }
  }
}
