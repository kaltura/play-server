
class ServerInfra
{
	static isParamDefined(params, paramName)
	{
		if(typeof params[paramName] === 'undefined')
			return false;
		return true;
	}
	
}
module.exports = ServerInfra;
