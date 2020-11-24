import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { LgNetcastTV } from './platformAccessory';
import { Channel } from 'lg-netcast';

export interface ChannelConfig {
  name: string;
  type: string;
  channel: Channel;
}

export interface NetcastAccessory {
  name: string;
  host: string;
  model: string;
  mac: string;
  accessToken: string;
  channels: ChannelConfig[];
  keyInputDelay: number;
  offPauseDuration: number;
}

interface LgNetcastPlatformConfig extends PlatformConfig {
  accessories?: NetcastAccessory[];
}

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class LgNetcastPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly accessoryConfig: NetcastAccessory[];

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(public readonly log: Logger, public readonly config: LgNetcastPlatformConfig, public readonly api: API) {
    this.log.debug('Finished initializing platform:', this.config.name);

    if (config.accessories === undefined) {
      config.accessories = [];
    }

    this.accessoryConfig = config.accessories;

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    const accessories = this.accessoryConfig;
    for (const device of accessories) {
      new LgNetcastTV(this, device);
    }
  }
}
