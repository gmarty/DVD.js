/// <reference path="node/node.d.ts" />

declare module "connect" {
	import events = require("events");
	import http = require("http");

	function connect(): connect.app;
	module connect{
		export function static(prefix: string, options?: any): Function;

		export interface app extends events.EventEmitter {
			use(route: string, fn: Function): app;
			use(route: Function, fn: Function): app;
			use(route: http.Server, fn: Function): app;
			use(route: string, fn: http.Server): app;
			use(route: Function, fn: http.Server): app;
			use(route: http.Server, fn: http.Server): app;
			use(fn: Function): app;
			use(fn: http.Server): app;

			(req: any, res: any, out?: any): void;

			listen(port: Number, hostname?: string, backlog?: Number, callback?: Function): http.Server;
			listen(path: string, callback?: Function): http.Server;
			listen(handle: any, callback?: Function): http.Server;
		}
	}

	export = connect;
}
