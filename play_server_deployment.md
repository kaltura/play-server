Environment:
=======================
 - 1 Memcache server per cloud.
 - 1 Shared disc per cloud /opt/kaltura/shared
 - 1 Load balancer per cloud (I recommend to use haproxy for QA environment, see http://cbonte.github.io/haproxy-dconv/configuration-1.5.html)

Machine prerequisites:
=======================
- Git (For Ubuntu: https://www.digitalocean.com/community/tutorials/how-to-install-git-on-ubuntu-12-04)
- Memcahced (For Ubuntu https://www.digitalocean.com/community/tutorials/how-to-install-and-use-memcache-on-ubuntu-12-04)
- Install mediaInfo by running: apt-get install mediainfo
- Run apt-get install python-software-properties
- Node 0.10.26 or above: installation reference: https://github.com/joyent/node/wiki/Installing-Node.js-via-package-manager#ubuntu-mint-elementary-os
- Node Packaged Modules (npm) 1.4.3 or above (see above)
- Node gyp 0.13.0 or above: npm install -g node-gyp
- Apache Ant 1.8.2 or above: apt-get -u install ant
- Run apt-get install libmemcached-dev
- Run apt-get install libfontconfig1

Code:
=======================
Clone https://github.com/kaltura/play-server to /opt/kaltura/play-server :
git clone -b v1.1 https://github.com/kaltura/play-server

Install:
=======================
 - cd /opt/kaltura/play-server
 - npm install
 - ant -Dversion={version} (e.g -Dversion=v1.1)
 - ln -s /opt/kaltura/play-server/bin/ffmpeg [PATH to FFMPEG]
 - ln -s /opt/kaltura/play-server/bin/ffprobe [PATH to FFPROBE]

Configure:
=======================
- cp /opt/kaltura/play-server/config/config.ini.template /opt/kaltura/play-server/config/config.ini
- cp /opt/kaltura/play-server/config/managers.ini.template /opt/kaltura/play-server/config/managers.ini
- mkdir /opt/kaltura/shared/tmp
- mkdir /opt/kaltura/shared/tmp/ad_download
- mkdir /opt/kaltura/log

Replace tokens in ini files:
=======================
- @SERVICE_URL@ - Kaltura API server host name
- @PLAY_PARTNER_ADMIN_SECRET@ - Admin secret of partner -6.
- @CLOUD_HOSTNAME@ - Hostname of the cloud load balancer.
- @CLOUD_SECRET@ - Random short string, e.g. 'abc'
- @CLOUD_SHARED_TEMP_PATH@ - path to shared temp folder disc, e.g. /opt/kaltura/shared/tmp
- @LOG_DIR@ - Path to logs folder, e.g. /opt/kaltura/log.
- If you are not running with a production environment Wowza license update hackWowzaUniqueSession to 1   

Execute:
=======================
node /opt/kaltura/play-server/main.js
