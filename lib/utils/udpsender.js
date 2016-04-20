require('./KalturaConfig');

var port = KalturaConfig.config.udpsender.PORT;
var host = KalturaConfig.config.udpsender.HOST;
var client = require('dgram').createSocket('udp4');
var udpsender = {
    sendFunction : function (message,response){
        var message_buffer = new Buffer(message);
        response.log('#UDP ' + message_buffer + ' sent to ' + host + ':' + port);
        client.send(message_buffer, 0, message_buffer.length,port,host,
            function (err, bytes) {
                if (err)
                    response.log('Fail to send messge -"' + message_buffer + '"  to ' + host + ':' + port + 'error:' + err);
            });
    }
}

module.exports = udpsender;



