![Logo](admin/admin.png)
# ioBroker.admin
===================

[![NPM version](http://img.shields.io/npm/v/iobroker.admin.svg)](https://www.npmjs.com/package/iobroker.admin)
[![Downloads](https://img.shields.io/npm/dm/iobroker.admin.svg)](https://www.npmjs.com/package/iobroker.admin)

[![NPM](https://nodei.co/npm/iobroker.admin.png?downloads=true)](https://nodei.co/npm/iobroker.admin/)


User interface for configuration and administration.

## Using common.localLink

- %ip% - ioBroker ip address (address of the admin)
- %secure% or %protocol% - read from native.secure the value and use http or https
- %web_protocol% - looking for the first instance of web (e.g. web.0) and get "native.secure" from "system.adapter.web.0"
- %instance% - instance of the adapter
- %someField% - get someField from "native" of this adapter instance
- %web.0_bind% - get native.bind from "system.adapter.web.0"
- %native_someField% - get someField from "native" of this adapter instance

## Scheduled restart
Some adapters re not stable or connection disappear after one or two days.
To fix this there is a scheduled restart setting.
To activate scheduled restart just define CRON condition when to restart adapter.

It is suggested to restart in the night, when no one use the adapter, e.g. "0 3 * * *" - at 3:00 every day.

## Let's Encrypt Certificates
Let’s Encrypt is a free, automated, and open certificate authority brought to you by the non-profit Internet Security Research Group (ISRG).

You can read about Let’s Encrypt [here](https://letsencrypt.org/).

Some installations use Dynamic DNS and Co to get the domain name and to reach under this domain name own web sites.
ioBroker supports automatic request and renew of certificates from Let’s Encrypt Organisation.

There is an option to activate free certificates from Let’s Encrypt almost in every adapter, that can start some web server and supports HTTPS.

If you just enable the using of certificates and will not activate an automatic update the instance will try to use stored certificates.

If the automatic update is activated the instance will try to request certificates from Let’s Encrypt and will automatically update it.

The certificates will be first requested when the given domain address will be accessed. E.g you have "sub.domain.com" as address, when you try to access https://sub.domain.com the certificates will be first requested and it can last a little before first answer will come.

The issuing of certificates is rather complex procedure, but if you will follow the explanation you will easy get free certificates.

Description:

1. The new account will be created with given email address (you must set it up in system settings)
2. Some random key will be created as password for the account.
3. After the account is created the system starts on port 80 the small web site to confirm the domain.
4. Let's encrypt use **always** port **80** to check the domain.
5. If port 80 is occupied by other service see point 4.
6. After the small web server is up the request to get certificates for given domains (system settings) will be sent to the Let's encrypt server.
7. Let's encrypt server sends back some challenge phrase as answer on the request and after a while tries to read this challenge phrase on "http://yourdomain:80/.well-known/acme-challenge/<CHALLENGE>"
8. If challenge phrase from our side comes back the Let's encrypt server send us the certificates. They will be stored in the given directory (system settings).

Sounds complex, but everything what you must do is to activate checkboxes and specify your email and domain in system settings.

The received certificates are valid ca. 90 days.
After the certificates are received the special task will be started to automatically renew the certificates.

The topic is rather complex and 1000 things can go wrong. If you cannot get certificates please use cloud service to reach your installation from internet.

**Let's encrypt works only from node.js version>=4.5**

## Todo
- move html tooltips to materialize tooltips
- tiles for hosts (additionally to table - low prior)
- tiles for instances (additionally to table - low prior)

## Used icons
This project uses some icons from [Flaticon](https://www.flaticon.com/):
- <img src="src/img/rooms/006-double-bed.svg" height="48" /> - "designed by smalllikeart from Flaticon"
- <img src="src/img/rooms/016-armchair-1.svg" height="48" /> - "designed by smalllikeart from Flaticon"
- <img src="src/img/devices/light-bulb.svg" height="48" /> - Icons made by [Vectors Market](https://www.flaticon.com/authors/vectors-market) from [Flaticon](https://www.flaticon.com/) is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/).

## Changelog
### 3.1.5 (2018-01-28)
* (bluefox) Fixes for Firefox and MS-EDGE

### 3.1.2 (2018-01-25)
* (bluefox) GUI corrections

### 3.0.12 (2018-01-19)
* (bluefox) Old configuration dialogs fixed
* (bluefox) convert strings to booleans by object edit
* (DeepCoreSystem) Updates in english, german and french translations
* (bluefox) buttons layout fixed
* (bluefox) event fixes

### 3.0.11 (2018-01-11)
* (DeepCoreSystem) French update
* (bluefox) fix error with empty ID 
* (bluefox) add sort by "recently updated"
* (ldittmar) add readme and issues viewer

### 3.0.10 (2018-01-06)
* (bluefox) Update indication
* (ldittmar) Use jQuery3
* (AlCalzone) German translations

### 3.0.7 (2018-01-01)
* (soef) update instances, objects and other lists
* (bluefox) rewrite interface with materialize 

### 2.0.11 (2017-10-23)
* (bluefox) Configurable event update disable threshold

### 2.0.10 (2017-10-22)
* (soef) added use of delete-key in the objects view

### 2.0.8 (2017-10-12)
* (soef) fix quickEdit: number with boolean value

### 2.0.7 (2017-10-11)
* (soef) Sort option added to object view

### 2.0.5 (2017-10-06)
* (bluefox) Show the history charts if the web server has the https option on too

### 2.0.3 (2017-08-13)
* (bluefox) Fix user access rights for sendToHost

### 2.0.2 (2017-08-12)
* (bluefox) Add the editing of the default access rights

### 2.0.1 (2017-08-07)
* (bluefox) Allow access via iobroker.pro
* (bluefox) Add node.js version recommendation

### 1.8.3 (2017-07-24)
* (bluefox) allow access on tmp directory

### 1.8.0 (2017-06-02)
* (bluefox) split into modules

### 1.7.6 (2017-06-01)
* (bluefox) Fix edit of the enum name

### 1.7.5 (2017-05-20)
* (bluefox) catch error if translated object is not text
* (bluefox) update selectID.js
* (bluefox) do not open configuration dialog for instances with no config
* (Steiger04) select multiple auch bei data-name="[eigner-name]"

### 1.7.3 (2017-03-25)
* (bluefox) fix license dialog
* (bluefox) change color of tooltip text
* (ykuendig) update german translation
* (bluefox) add docs

### 1.7.2 (2017-03-15)
* (bluefox) add statistics selector for no-city
* (bluefox) support of discovery by first start

### 1.7.1 (2017-03-11)
* (apollon77) fix save button functionality
* (ykuendig) Update german translations
* (bluefox) patch repositories to support stable

### 1.7.0 (2017-03-08)
* (bluefox) fix log
* (bluefox) show jQuery button for role button
* (apollon77) update testing setup.js
* (bluefox) fix wetty loading
* (bluefox) fix add/delete tabs
* (bluefox) implement hints for configuration dialog
* (bluefox) redirect if IP address changes
* (bluefox) add tooltip instruction
* (bluefox) wizard support
* (bluefox) fix acl error
* (bluefox) fix license agree button

