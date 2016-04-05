/*var KalturaConfig = {
    client: require('../client/KalturaClient')
};
*/
require('./KalturaConfig');

var PORT;
var HOST;
var dgram;
var client;
var initSender = function()
{
    PORT = KalturaConfig.config.udpsender.PORT;
    HOST = KalturaConfig.config.udpsender.HOST;
    dgram = require('dgram');
    client = dgram.createSocket('udp4');
    //console.log('params'+ " PORT " + PORT + " HOST" +  HOST );
    return true;
}

var init = initSender();

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
            //console.log('UDP ' + message_buffer + ' sent to ' + HOST + ':' + PORT);
        });
}

/*

 var params= new Object();
 params.totalDuration = 120;
 params.adSequence = 250;
 params.outputStart = 350
 params.outputEnd = 360;
 params.adStart = 470;
 var eventType = 'eventType 1';
 var statusCode = 100;
 var url = 'www.google.com';
 var msgobj = new Object();
 msgobj.params = JSON.stringify(params);
 msgobj.eventType = eventType;
 msgobj.statusCode = statusCode;
 msgobj.url = url;

 if(statusCode == 408){
 console.log('Failed to send beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] url [' + url + '], timeout');
 msgobj.status = 'Failed';
 }
 else{
 console.log('beacon for tracking id [' + params.trackingId + '] type [' + eventType + '] partner [' + params.partnerId + '] url [' + url + '] sent with status: [' + statusCode + ']');
 msgobj.status = 'success';
 }

 //var count = process.argv[2];
var count = 5;
 console.log('going to send %s times , the message %s ',count,JSON.stringify(msgobj));
 for (var i=0;i<count;i++) {
 sendFunction(JSON.stringify(msgobj));
 }
 console.log('Done',count);
 setTimeout(function() { client.close(); process.exit(0) }, 500);

*/