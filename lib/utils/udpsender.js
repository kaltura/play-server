require('./KalturaConfig');

var PORT = KalturaConfig.config.udpsender.PORT;
var HOST = KalturaConfig.config.udpsender.HOST;
var client = require('dgram').createSocket('udp4');

var sendFunction = function (message,response){
    var message_buffer = new Buffer(message);
    response.log('#UDP ' + message_buffer + ' sent to ' + HOST + ':' + PORT);
    client.send(message_buffer, 0, message_buffer.length,PORT, HOST,
        function (err, bytes) {
            if (err) {
                client.close();
            }
        });
}


module.exports = sendFunction;

