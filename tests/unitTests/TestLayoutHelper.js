const chai = require('chai');
const expect = chai.expect;
const LayoutHelper = require('../../lib/managers/helpers/LayoutHelper');
const util = require('util');

const continuationLocalStorage = require('continuation-local-storage');
const namespace = continuationLocalStorage.createNamespace('play-server');//Here just to make sure we create it only once

const entryId = '0_123456';

describe('testLayoutHelper', function ()
{
	before(function() {
		LayoutHelper.deleteEntryVersion(entryId,() => {}, () => {});
	});

	it('test initEntryVersion', function (done)
	{
		namespace.bind(LayoutHelper.initEntryVersion(entryId,
			function() {
				done();
			},function(err){
				expect(err).to.equal(null);
			})
		);
	});

	it('test getEntryVersion', function (done)
	{
		LayoutHelper.getEntryVersion(entryId,
			function(response) {
				expect(response.id).to.equal(LayoutHelper.getBaseVersion());
				done();
			},function(err){
				expect(err).to.equal(null);
				done();
			});
	});

	it('test updateEntryVersion', function (done)
	{
		LayoutHelper.updateEntryVersion(entryId,
			function(){
				LayoutHelper.getEntryVersion(entryId,
					function(response){
						expect(response.id).to.equal(LayoutHelper.incrementVersion(LayoutHelper.getBaseVersion()));
						done();
					},function(err){
						expect(err).to.equal(null);
						done();
					});
			},function(err){
				expect(err).to.equal(null);
				done();
			});
	});

	it('test resetEntryVersion', function (done)
	{
		LayoutHelper.resetEntryVersion(entryId,
			function(){
				LayoutHelper.getEntryVersion(entryId,
					function(response){
						expect(response.id).to.equal(LayoutHelper.getBaseVersion());
						done();
					},function(err){
						expect(err).to.equal(null);
						done();
					});
			},function(err){
				expect(err).to.equal(null);
				done();
			});
	});
});
