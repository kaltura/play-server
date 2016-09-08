const chai = require('chai');
const expect = chai.expect; // we are using the 'expect' style of Chai
const KalturaCouchbaseConnector = require('../../lib/utils/KalturaCouchbaseConnector');
const KalturaMemcacheConnector = require('../../lib/utils/KalturaMemcacheConnector');

describe('testMemcacheConnector', function() {
	const connector = KalturaMemcacheConnector;

	it('check all with memcache', function() {
		// add(key, value, lifetime, callback, errorCallback, is_encrypted)
		connector.add('MyKey', 'myValue', 10000,
			function(){expect('Succeeded adding key').to.equal('Succeeded adding key')},
			function(){expect('Should have succeeded adding key').to.equal('Yet Failed')}
		);
		connector.append('MyKey', 'myValue2', 10000,
			function(){expect('Succeeded append to key').to.equal('Succeeded append to key')},
			function(){expect('Should have succeeded appending key').to.equal('Yet Failed')}
		);
		connector.get('MyKey',
			function(data, err){
				expect(data).to.equal('MyValueMyValue2');
				expect(err).to.equal(null);
			},
			function(err){expect('Should have succeeded getting key').to.equal('Yet Failed')}
		);
		connector.get('MyKeyNotValid',
			function(data, err){
				expect(data).to.equal(null);
				expect(err).to.equal(null);
			},
			function(err){expect('Should not fail on invalid get').to.equal('Yet did')}
		);
		connector.set('MyKey', 'MyValue3', 10000,
			function(){expect('Succeeded setting key with value').to.equal('Succeeded setting key with value')},
			function(){expect('Should have succeeded setting key').to.equal('Yet Failed')}
		);
	});
});

describe('testCouchbaseConnector', function() {
	const connector = KalturaCouchbaseConnector.getInstance();

	it('test add', function()
	{
		// add(key, value, lifetime, callback, errorCallback, is_encrypted)
		connector.add('MyKey', 'myValue', 10000,
			function ()
			{
				expect('Succeeded adding key').to.equal('Succeeded adding key')
			},
			function ()
			{
				expect('Should have succeeded adding key').to.equal('Yet Failed')
			}
		);
	});
	it('test add duplicate key', function()
	{
		// add(key, value, lifetime, callback, errorCallback, is_encrypted)
		connector.add('MyKey', 'myValue', "1",
			function ()
			{
				expect('Should not have succeeded adding key').to.equal('Yet Did')
			},
			function ()
			{
				expect('did not Succeed adding key').to.equal('did not Succeed adding key')
			}
		);
	});
	it('test append', function()
	{
		connector.append('MyKey', 'myValue2',
			function ()
			{
				expect('Succeeded append to key').to.equal('Succeeded append to key')
			},
			function ()
			{
				expect('Should have succeeded appending key').to.equal('Yet Failed')
			}
		);
	});
	it('test rest' , function(){
		connector.get('MyKey',
			function(data, err){
				expect(data).to.equal('MyValueMyValue2');
				expect(err).to.equal(null);
			},
			function(err){expect('Should have succeeded getting key').to.equal('Yet Failed')}
		);
		connector.get('MyKeyNotValid',
			function(data, err){
				expect(data).to.equal(null);
				expect(err).to.equal(null);
			},
			function(err){expect('Should not fail on invalid get').to.equal('Yet did')}
		);
		connector.set('MyKey', 'MyValue3', 10000,
			function(){expect('Succeeded setting key with value').to.equal('Succeeded setting key with value')},
			function(){expect('Should have succeeded setting key').to.equal('Yet Failed')}
		);
	});
});