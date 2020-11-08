import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';
import { LgNetcastPlatform, NetcastAccessory, ChannelConfig } from './platform';

import { Channel, NetcastClient, LG_COMMAND } from 'lg-netcast';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class LgNetcastTV {
  private service: Service;
  private netcastClient: NetcastClient;
  private netcastAccessory: NetcastAccessory;
  private currentChannel: Channel | null;
  private channelUpdateInProgress: boolean;

  private unknownChannelIdentifier: number;
  private unknownChannelName: string;

  constructor(private readonly platform: LgNetcastPlatform, private readonly accessory: PlatformAccessory) {
    this.currentChannel = null;
    this.netcastAccessory = accessory.context.device;
    this.netcastClient = new NetcastClient(this.netcastAccessory.host);
    this.channelUpdateInProgress = false;

    this.unknownChannelIdentifier = this.netcastAccessory.channels.length;
    this.unknownChannelName = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'LG')
      .setCharacteristic(this.platform.Characteristic.Model, this.netcastAccessory.model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.netcastAccessory.host);

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service =
      this.accessory.getService(this.platform.Service.Television) ||
      this.accessory.addService(this.platform.Service.Television);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE);

    // register handlers for the On/Off Characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .on('set', this.setOn.bind(this)) // SET - bind to the `setOn` method below
      .on('get', this.getOn.bind(this)); // GET - bind to the `getOn` method below

    this.service
      .setCharacteristic(this.platform.Characteristic.ActiveIdentifier, 1)
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, this.netcastAccessory.name)
      .setCharacteristic(this.platform.Characteristic.Name, this.netcastAccessory.name)
      .setCharacteristic(
        this.platform.Characteristic.SleepDiscoveryMode,
        this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
      );

    // handle input source changes
    this.service
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .on('set', async (newValue, callback) => {
        // the value will be the value you set for the Identifier Characteristic
        // on the Input Source service that was selected - see input sources below.
        this.platform.log.info('set Active Identifier => setNewValue: ' + newValue);

        // if unknown identifier, just update it without doing anything
        if (newValue === this.unknownChannelIdentifier) {
          callback(null);
          return;
        }

        const newChannel = this.netcastAccessory.channels[newValue];
        const currentChannel = this.currentChannel;

        this.channelUpdateInProgress = true;
        if (newChannel.channel.inputSourceIdx !== undefined) {
          // if different inputsourceidx, we have to manually switch to the channel
          if (newChannel.channel.inputSourceIdx !== currentChannel?.inputSourceIdx) {
            await this.switchToSourceIdx(parseInt(newChannel.channel.inputSourceIdx));
            await this.wait(3000);
          }
        }

        if (newChannel.type === 'tuner') {
          const sessionId = await this.netcastClient.get_session(this.netcastAccessory.accessToken);
          await this.netcastClient.change_channel(newChannel.channel, sessionId);
        }

        this.channelUpdateInProgress = false;
        callback(null);
      });

    this.service.getCharacteristic(this.platform.Characteristic.RemoteKey).on('set', async (newValue, callback) => {
      switch (newValue) {
        case this.platform.Characteristic.RemoteKey.REWIND: {
          await this.sendAuthorizedCommand(LG_COMMAND.REWIND);
          break;
        }
        case this.platform.Characteristic.RemoteKey.FAST_FORWARD: {
          await this.sendAuthorizedCommand(LG_COMMAND.FAST_FORWARD);
          break;
        }
        case this.platform.Characteristic.RemoteKey.NEXT_TRACK: {
          await this.sendAuthorizedCommand(LG_COMMAND.SKIP_FORWARD);
          break;
        }
        case this.platform.Characteristic.RemoteKey.PREVIOUS_TRACK: {
          await this.sendAuthorizedCommand(LG_COMMAND.SKIP_BACKWARD);
          break;
        }
        case this.platform.Characteristic.RemoteKey.ARROW_UP: {
          await this.sendAuthorizedCommand(LG_COMMAND.UP);
          break;
        }
        case this.platform.Characteristic.RemoteKey.ARROW_DOWN: {
          await this.sendAuthorizedCommand(LG_COMMAND.DOWN);
          break;
        }
        case this.platform.Characteristic.RemoteKey.ARROW_LEFT: {
          await this.sendAuthorizedCommand(LG_COMMAND.LEFT);
          break;
        }
        case this.platform.Characteristic.RemoteKey.ARROW_RIGHT: {
          await this.sendAuthorizedCommand(LG_COMMAND.RIGHT);
          break;
        }
        case this.platform.Characteristic.RemoteKey.SELECT: {
          await this.sendAuthorizedCommand(LG_COMMAND.OK);
          break;
        }
        case this.platform.Characteristic.RemoteKey.BACK: {
          await this.sendAuthorizedCommand(LG_COMMAND.BACK);
          break;
        }
        case this.platform.Characteristic.RemoteKey.EXIT: {
          await this.sendAuthorizedCommand(LG_COMMAND.EXIT);
          break;
        }
        case this.platform.Characteristic.RemoteKey.PLAY_PAUSE: {
          await this.sendAuthorizedCommand(LG_COMMAND.PLAY);
          break;
        }
        case this.platform.Characteristic.RemoteKey.INFORMATION: {
          await this.sendAuthorizedCommand(LG_COMMAND.PROGRAM_INFORMATION);
          break;
        }
      }

      // don't forget to callback!
      callback(null);
    });

    const speakerService =
      this.accessory.getService(this.platform.Service.TelevisionSpeaker) ||
      this.accessory.addService(this.platform.Service.TelevisionSpeaker);

    speakerService
      .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
      .setCharacteristic(
        this.platform.Characteristic.VolumeControlType,
        this.platform.Characteristic.VolumeControlType.RELATIVE,
      );

    // handle volume control
    speakerService
      .getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .on('set', async (newValue, callback) => {
        if (newValue === 0) {
          await this.sendAuthorizedCommand(LG_COMMAND.VOLUME_UP);
        } else {
          await this.sendAuthorizedCommand(LG_COMMAND.VOLUME_DOWN);
        }
        callback(null);
      });

    for (const [i, chan] of this.netcastAccessory.channels.entries()) {
      let existingChanService = this.findInputService(chan.name);
      if (existingChanService === null) {
        this.platform.log.info('Creating new input service: ', chan.name);
        existingChanService = this.accessory.addService(this.platform.Service.InputSource, chan.name, chan.name);
      }

      // set characteristics
      existingChanService
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, chan.name)
        .setCharacteristic(this.platform.Characteristic.Identifier, i)
        .setCharacteristic(
          this.platform.Characteristic.InputSourceType,
          this.platform.Characteristic.InputSourceType.HDMI,
        )
        .setCharacteristic(
          this.platform.Characteristic.IsConfigured,
          this.platform.Characteristic.IsConfigured.CONFIGURED,
        );

      this.service.addLinkedService(existingChanService);
    }

    this.removeUnusedInputServices(this.netcastAccessory.channels);

    // interval for updating the current active identifier
    this.updateCurrentChannel();
    setInterval(() => {
      this.updateCurrentChannel();
    }, 5000);
  }

  wait(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async sendAuthorizedCommand(cmd: LG_COMMAND) {
    this.platform.log.debug('Sending command to TV: ', cmd, LG_COMMAND[cmd]);
    const sessionId = await this.netcastClient.get_session(this.netcastAccessory.accessToken);
    return this.netcastClient.send_command(cmd, sessionId);
  }

  /**
   * Switches the TV to the given inputsource idx This will literally open the
   * input source selector and click LEFT/RIGHT enough times to reach the target
   * channel. This is a VERY hacky way of doing this, but the netcast API
   * doesn't allow any other way You can't switch from HDMI to a channel and you
   * can't switch from a channel back to HDMI
   *
   * Instead of this way, it would be much better to use Simplink and HDMI
   * through an AppleTV or Chromecast
   *
   * @param      {number}  idx     The index to switch to
   */
  async switchToSourceIdx(idx: number) {
    const currentIdxStr = this.currentChannel?.inputSourceIdx;
    if (currentIdxStr === undefined) {
      return;
    }

    const currentIdx = parseInt(currentIdxStr);

    // nothing to do here
    if (currentIdx === idx) {
      return;
    }

    this.platform.log.debug('Request to switch to input source idx: ', idx);
    this.platform.log.debug('Current source idx: ', currentIdx);

    // Open input source switch menu and wait 2s
    // 2s because sometimes this menu can be pretty slow to load...
    this.platform.log.debug('Opening InputSource selection');
    await this.sendAuthorizedCommand(LG_COMMAND.EXTERNAL_INPUT);
    await this.wait(2000);

    // Click LEFT/RIGHT enough times for us to reach the target channel
    // Then click "OK" to select it
    if (currentIdx > idx) {
      const diff = currentIdx - idx - 1;
      for (let i = 1; i <= diff; i++) {
        await this.sendAuthorizedCommand(LG_COMMAND.LEFT);
        await this.wait(this.netcastAccessory.keyInputDelay);
      }
      await this.sendAuthorizedCommand(LG_COMMAND.OK);
    }

    if (currentIdx < idx) {
      const diff = idx - currentIdx - 1;
      for (let i = 1; i <= diff; i++) {
        await this.sendAuthorizedCommand(LG_COMMAND.RIGHT);
        await this.wait(this.netcastAccessory.keyInputDelay);
      }
      await this.sendAuthorizedCommand(LG_COMMAND.OK);
    }
  }

  /**
   * Updates the current channel state
   */
  async updateCurrentChannel() {
    try {
      const sessionId = await this.netcastClient.get_session(this.netcastAccessory.accessToken);
      this.currentChannel = await this.netcastClient.get_current_channel(sessionId);
    } catch (e) {
      this.currentChannel = null;
    }

    if (this.currentChannel === null) {
      return;
    }

    // Check if we are currently switching channels. If yes, don't do anything to not interfere
    if (this.channelUpdateInProgress) {
      return;
    }

    // check all existing channels and see if the current channel matches with either of them
    // if it does, update the active input source to that
    for (const [i, chan] of this.netcastAccessory.channels.entries()) {
      if (
        (chan.type === 'hdmi' && chan.channel.inputSourceIdx === this.currentChannel.inputSourceIdx) ||
        (chan.type === 'tuner' &&
          chan.channel.major === this.currentChannel.major &&
          chan.channel.minor === this.currentChannel.minor)
      ) {
        const currentActiveIdentifier = this.service.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
          .value;

        this.platform.log.debug(`Potentially identified active channel as '${chan.name}'`);
        if (currentActiveIdentifier !== i) {
          this.service.setCharacteristic(this.platform.Characteristic.ActiveIdentifier, i);
        }
        this.hideWildcardChannel();
        return;
      }
    }

    let chanName = this.currentChannel.chname || '';
    if (typeof chanName === 'object') {
      chanName = this.currentChannel.labelName || '';
    }
    if (typeof chanName === 'object') {
      chanName = this.currentChannel.inputSourceName || '';
    }

    this.updateWildcardChannel(chanName);
  }

  updateWildcardChannel(name: string) {
    this.platform.log.debug(`Creating temporary channel with name '${name}'`);
    // add extra accessory for UNKNOWN
    let existingChanService = this.findInputService(this.unknownChannelName);
    if (existingChanService === null) {
      existingChanService = this.accessory.addService(
        this.platform.Service.InputSource,
        this.unknownChannelName,
        this.unknownChannelName,
      );
    }
    existingChanService
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, name)
      .setCharacteristic(this.platform.Characteristic.Identifier, this.unknownChannelIdentifier)
      .setCharacteristic(
        this.platform.Characteristic.InputSourceType,
        this.platform.Characteristic.InputSourceType.OTHER,
      )
      .setCharacteristic(
        this.platform.Characteristic.IsConfigured,
        this.platform.Characteristic.IsConfigured.CONFIGURED,
      )
      .setCharacteristic(
        this.platform.Characteristic.CurrentVisibilityState,
        this.platform.Characteristic.CurrentVisibilityState.SHOWN,
      );
    this.service.addLinkedService(existingChanService);

    const currentActiveIdentifier = this.service.getCharacteristic(this.platform.Characteristic.ActiveIdentifier).value;
    if (currentActiveIdentifier !== this.unknownChannelIdentifier) {
      this.service.setCharacteristic(this.platform.Characteristic.ActiveIdentifier, this.unknownChannelIdentifier);
    }
  }

  hideWildcardChannel() {
    const existingChanService = this.findInputService(this.unknownChannelName);
    if (existingChanService === null) {
      return;
    }

    if (
      existingChanService.getCharacteristic(this.platform.Characteristic.CurrentVisibilityState).value ===
      this.platform.Characteristic.CurrentVisibilityState.HIDDEN
    ) {
      return;
    }

    this.platform.log.debug('Hiding temporary channel');
    existingChanService.setCharacteristic(
      this.platform.Characteristic.CurrentVisibilityState,
      this.platform.Characteristic.CurrentVisibilityState.HIDDEN,
    );
  }

  findInputService(name: string) {
    for (const ser of this.accessory.services) {
      for (const linkedSer of ser.linkedServices) {
        if (linkedSer.displayName === name) {
          this.platform.log.info('Found existing input service: ', linkedSer.displayName);
          return linkedSer;
        }
      }
    }

    return null;
  }

  async removeUnusedInputServices(channelConfig: ChannelConfig[]) {
    const channelNameMap = {};
    for (const c of channelConfig) {
      channelNameMap[c.name] = null;
    }

    for (const ser of this.accessory.services) {
      for (const linkedSer of ser.linkedServices) {
        if (channelNameMap[linkedSer.displayName] === undefined) {
          this.platform.log.info('Removed unused input service: ', linkedSer.displayName);
          this.service.removeLinkedService(linkedSer);
          this.accessory.removeService(linkedSer);
        }
      }
    }
  }

  async setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (value) {
      this.platform.log.debug('TV state changed to on, however I cant turn it on. Just updating state isntead');
      this.platform.log.debug('Use automations to turn the TV on, such as pinging an AppleTV.');
      callback(null, true);
      return;
    }

    await this.sendAuthorizedCommand(LG_COMMAND.POWER);
    this.platform.log.debug('TV turned off.');
    callback(null, false);
  }

  async getOn(callback: CharacteristicGetCallback) {
    this.platform.log.debug('Querying TV state...');
    if (this.currentChannel === null) {
      return callback(null, false);
    }

    return callback(null, true);
  }
}
