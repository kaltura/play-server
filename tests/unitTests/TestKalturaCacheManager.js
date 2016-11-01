const chai = require('chai');
const expect = chai.expect; // we are using the 'expect' style of Chai
const KalturaCouchbaseConnector = require('../../lib/utils/KalturaCouchbaseConnector');
const KalturaMemcacheConnector = require('../../lib/utils/KalturaMemcacheConnector');
let localUndefined;
//describe.skip('testCouchbaseConnector', function() {
//	const connector = KalturaCouchbaseConnector.getInstance();
//
//	it('check all with couchbase', function(done) {
//		// add(key, value, lifetime, callback, errorCallback, is_encrypted)
//		connector.add('MyKey', 'myValue', 10000,
//			function(){expect('Succeeded adding key').to.equal('Succeeded adding key');},
//			function(){expect('Should have succeeded adding key').to.equal('Yet Failed');}
//		);
//		connector.append('MyKey', 'myValue2', 10000,
//			function(){expect('Succeeded append to key').to.equal('Succeeded append to key');},
//			function(){expect('Should have succeeded appending key').to.equal('Yet Failed');}
//		);
//		connector.get('MyKey',
//			function(data, err){
//				expect(data).to.equal('MyValueMyValue2');
//				expect(err).to.equal(null);
//			},
//			function(err){expect('Should have succeeded getting key').to.equal('Yet Failed');}
//		);
//		connector.get('MyKeyNotValid',
//			function(data, err){
//				expect(data).to.equal(null);
//				expect(err).to.equal(null);
//			},
//			function(err){expect('Should not fail on invalid get').to.equal('Yet did');}
//		);
//		connector.set('MyKey', 'MyValue3', 10000,
//			function(){expect('Succeeded setting key with value').to.equal('Succeeded setting key with value');},
//			function(){expect('Should have succeeded setting key').to.equal('Yet Failed');}
//		);
//	});
//});

describe('testMemcacheConnector', function() {
	const connector = KalturaMemcacheConnector;

	it('test delete', function(done)
	{
		// just to reset the cache
		connector.del('MyKey',
			function ()
			{
				done();
			},
			function ()
			{
				done();
			}
		);
	});
	it('test add', function(done)
	{
		connector.add('MyKey', 'MyValue', 10000,
			function ()
			{
				expect('Succeeded adding key').to.equal('Succeeded adding key');
				done();
			},
			function ()
			{
				expect('Should have succeeded adding key').to.equal('Yet Failed');
				done();
			}
		);
	});
	it('test add duplicate key', function(done)
	{
		connector.add('MyKey', 'MyValue', '1000',
			function ()
			{
				expect('Should not have succeeded adding key').to.equal('Yet Did');
				done();
			},
			function ()
			{
				expect('did not Succeed adding key').to.equal('did not Succeed adding key');
				done();
			}
		);
	});
	it('test append', function(done)
	{
		connector.append('MyKey', 'MyValue2',
			function ()
			{
				expect('Succeeded append to key').to.equal('Succeeded append to key');
				done();
			},
			function ()
			{
				expect('Should have succeeded appending key').to.equal('Yet Failed');
				done();
			}
		);
	});
	it('test getValid' , function(done)
	{
		connector.get('MyKey',
			function (data, err)
			{
				expect(data).to.equal('MyValueMyValue2');
				expect(err).to.equal(localUndefined);
				done();
			},
			function (err)
			{
				expect('Should have succeeded getting key').to.equal('Yet Failed');
				done();
			}
		);
	});
	it('test getNotValid' , function(done)
	{
		connector.get('MyKeyNotValid',
			function (data, err)
			{
				expect(data).to.equal(localUndefined);
				expect(err).to.equal(localUndefined);
				done();
			},
			function (err)
			{
				expect('Should not fail on invalid get').to.equal('Yet did');
				done();
			}
		);
	});
	it('test set' , function(done)
	{
			connector.set('MyKey', 'MyValue3', 10000,
			function(){
				expect('Succeeded setting key with value').to.equal('Succeeded setting key with value');
				done();
			},
			function(){
				expect('Should have succeeded setting key').to.equal('Yet Failed');
				done();
			}
		);
	});
});