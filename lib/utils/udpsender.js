var PORT = 3333;
var HOST = '192.168.56.1';
var dgram = require('dgram')
var client = dgram.createSocket('udp4');

module.exports = {
    sendFunction:sendFunction
}

var sendFunction = function (message) {
    var message_buffer = new Buffer(message);
    client.send(message_buffer, 0, message_buffer.length, PORT, HOST,
        function (err, bytes) {
            if (err) {
                throw err;
                client.close();
            }
            console.log('UDP ' + message_buffer + ' sent to ' + HOST + ':' + PORT);
        });
}
