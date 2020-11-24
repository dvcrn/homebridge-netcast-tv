# homebridge-netcast-tv

Homebridge plugin for interacting with LG Netcast-based TVs (2012, 2013)

**Warning:** This is very much a proof of concept to get my TV working. It might work for you, and it might also not.

<!-- MarkdownTOC autolink="true" -->

- [Installation](#installation)
- [Setup](#setup)
- [Configuration](#configuration)
    - [Regarding channels](#regarding-channels)
    - [Example config](#example-config)
- [Caveats](#caveats)
    - [Turning on the TV](#turning-on-the-tv)
    - [Switching between HDMI and TV](#switching-between-hdmi-and-tv)
- [What is working](#what-is-working)
- [ETC](#etc)

<!-- /MarkdownTOC -->

## Installation

```
npm install -g homebridge-netcast-tv
```

TVs are exposed as separate accessories that you need to pair. This is a restriction of the HomeKit API, so after adding this accessory check your log files for the pairing code:

```
[11/24/2020, 8:29:52 PM] LG TV is running on port 60335.
[11/24/2020, 8:29:52 PM] Please add [LG TV] manually in Home app. Setup Code: 618-65-640
```

## Setup

To pair with the TV, you need to get it to display a valid access token.

This repository also comes with a `netcast-cli` helper tool that you can use to query the TV:

```
netcast-cli --command access_token --host 192.168.1.6
```

**Note**: The default port is `:8080`. Not specifying a port will use the default.

## Configuration

Add the platform to your config.json:

- `name`: Name of the accessory
- `host`: IP of your TV
- `mac`: Mac address of the TV
- `accessToken`: Pair code of the TV
- `keyInputDelay`: Delay in ms to wait before issuing repeated key presses (such as switching input source)
- `offPauseDuration`: Delay in ms to pause polling for TV status after turning off. This is needed because the TV still responds to channel query requests when it has been turned off
- `channels`: List of channels that are available

### Regarding channels

To identify the current channel, use the `netcast-cli` helper tool:

```
❯ netcast-cli --host 192.168.1.14:8080 --access_token xxxxx
Querying current channel
{
  chtype: 'terrestrial',
  sourceIndex: '1',
  physicalNum: '21',
  major: '81',
  displayMajor: '81',
  minor: '65535',
  displayMinor: '-1',
  chname: 'フジテレビ',
  progName: 'ザ・ノンフィクション　たたかれても　たたかれても…　〜山根明と妻のその 後〜',
  audioCh: '0',
  inputSourceName: 'TV',
  inputSourceType: '0',
  labelName: {},
  inputSourceIdx: '0'
}
```

Important notes here are:

**For HDMI devices**: Specify only `inputSourceType` and `inputSourceIdx`. Set `type` to "hdmi", this is very important!

**For channels**: Specify `type` = "tv" and the following keys:

```
"sourceIndex": "1",
"physicalNum": "25",
"major": "41",
"minor": "65535",
"inputSourceType": "0",
"inputSourceIdx": "0"
```

### Example config

```
 "platforms": [
        {
            "platform": "LgNetcast",
            "name": "LGPlatform",
            "accessories": [
                {
                    "accessory": "LgNetcastTV",
                    "name": "TestTV",
                    "host": "192.168.1.14",
                    "mac": "cc:2d:8c:a4:4a:d6",
                    "accessToken": "xxxxx",
                    "keyInputDelay": 600,
                    "offPauseDuration": 600000,
                    "channels": [
                        {
                            "name": "AppleTV",
                            "type": "external",
                            "channel": {
                                "inputSourceType": "6",
                                "inputSourceIdx": "3"
                            }
                        },
                        {
                            "name": "Chromecast",
                            "type": "external",
                            "channel": {
                                "inputSourceType": "6",
                                "inputSourceIdx": "4"
                            }
                        },
                        {
                            "name": "Nihon TV",
                            "type": "tv",
                            "channel": {
                                "sourceIndex": "1",
                                "physicalNum": "25",
                                "major": "41",
                                "minor": "65535",
                                "inputSourceType": "0",
                                "inputSourceIdx": "0"
                            }
                        },
                    }
                }
            ]
        }
```

## Caveats

### Turning on the TV

This is **not** supported. It's just not possible through the Netcast API nor wakeonlan, so as a workaround, use automations and HDMI CEC through LG Simplink. Turning the TV on itself won't do anything except setting the TV state to "on".

For example, use an AppleTV or Chromecast, and turn it on when the TV state turns to "on". (I personally use [homebridge-apple-tv-remote](https://www.npmjs.com/package/homebridge-apple-tv-remote) and turn the ATV on when my TV turns on.)

### Switching between HDMI and TV

This is also **not** supported through the Netcast API. The workaround that this plugin uses is to manually open the input source menu, then physically clicking LEFT/RIGHT, then hitting "OK". That's also why the `inputSourceIdx` key is needed for everything.

To change the interval in which keys are being issued, change the `keyInputDelay` config key. For my TV the UI loads really slow, so I had to set it between 600 - 1000ms.

## What is working

- Turning the TV off
- Switching channels
- Displaying current channel
- Switching between HDMI/TV through the workaround above
- Controlling the TV through the remote API
- Changing volume

## ETC

Powered by https://github.com/dvcrn/lg-netcast
