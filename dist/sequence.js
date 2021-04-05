"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const context_1 = require("@loopback/context");
const rest_1 = require("@loopback/rest");
const account_1 = require("@pokt-network/pocket-js/dist/keybase/models/account");
const logger = require('./services/logger');
const pocketJS = require('@pokt-network/pocket-js');
const { Pocket, Configuration, HttpRpcProvider } = pocketJS;
const shortID = require('shortid');
const SequenceActions = rest_1.RestBindings.SequenceActions;
let GatewaySequence = class GatewaySequence {
    constructor(dispatchURL, pocketSessionBlockFrequency, pocketBlockTime, clientPrivateKey, clientPassphrase, findRoute, parseParams, invoke, send, reject) {
        this.dispatchURL = dispatchURL;
        this.pocketSessionBlockFrequency = pocketSessionBlockFrequency;
        this.pocketBlockTime = pocketBlockTime;
        this.clientPrivateKey = clientPrivateKey;
        this.clientPassphrase = clientPassphrase;
        this.findRoute = findRoute;
        this.parseParams = parseParams;
        this.invoke = invoke;
        this.send = send;
        this.reject = reject;
    }
    async handle(context) {
        try {
            // Create the Pocket instance
            const dispatchers = [];
            if (this.dispatchURL.indexOf(",")) {
                const dispatcherArray = this.dispatchURL.split(",");
                dispatcherArray.forEach(function (dispatcher) {
                    dispatchers.push(new URL(dispatcher));
                });
            }
            else {
                dispatchers.push(new URL(this.dispatchURL));
            }
            const configuration = new Configuration(0, 100000, 0, 120000, false, this.pocketSessionBlockFrequency, this.pocketBlockTime, undefined, undefined, false);
            const rpcProvider = new HttpRpcProvider(dispatchers);
            const pocket = new Pocket(dispatchers, rpcProvider, configuration);
            context.bind('pocketInstance').to(pocket);
            context.bind('pocketConfiguration').to(configuration);
            // Unlock primary client account for relay signing
            try {
                const importAccount = await pocket.keybase.importAccount(Buffer.from(this.clientPrivateKey, 'hex'), this.clientPassphrase);
                if (importAccount instanceof account_1.Account) {
                    await pocket.keybase.unlockAccount(importAccount.addressHex, this.clientPassphrase, 0);
                }
            }
            catch (e) {
                logger.log('error', e);
                throw new rest_1.HttpErrors.InternalServerError('Unable to import or unlock base client account');
            }
            const { request, response } = context;
            // Record the host, user-agent, and origin for processing
            context.bind('host').to(request.headers['host']);
            context.bind('userAgent').to(request.headers['user-agent']);
            context.bind('origin').to(request.headers['origin']);
            context.bind('contentType').to(request.headers['content-type']);
            context.bind('relayPath').to(request.headers['relay-path']);
            context.bind('httpMethod').to(request.method);
            let secretKey = '';
            // SecretKey passed in via basic http auth
            if (request.headers['authorization']) {
                const base64Credentials = request.headers['authorization'].split(' ')[1];
                const credentials = Buffer.from(base64Credentials, 'base64')
                    .toString('ascii')
                    .split(':');
                if (credentials[1]) {
                    secretKey = credentials[1];
                }
            }
            context.bind('secretKey').to(secretKey);
            // Unique ID for log tracing
            context.bind('requestID').to(shortID.generate());
            // Custom routing for blockchain paths:
            // If it finds an extra path on the end of the request, slice off the path 
            // and convert the slashes to tildes for processing in the v1.controller
            if (request.method === "POST" &&
                (
                // Matches either /v1/lb/LOADBALANCER_ID or /v1/APPLICATION_ID
                request.url.match(/^\/v1\/lb\//) ||
                    request.url.match(/^\/v1\/[0-9a-zA-Z]{24}\//))) {
                if (request.url.match(/^\/v1\/lb\//)) {
                    request.url = `/v1/lb/${request.url.slice(7).replace(/\//gi, '~')}`;
                }
                else if (request.url.match(/^\/v1\/[0-9a-z]{24}\//)) {
                    request.url = `${request.url.slice(0, 28)}${request.url.slice(28).replace(/\//gi, '~')}`;
                }
            }
            const route = this.findRoute(request);
            const args = await this.parseParams(request, route);
            const result = await this.invoke(route, args);
            this.send(response, result);
        }
        catch (err) {
            this.reject(context, err);
        }
    }
};
GatewaySequence = tslib_1.__decorate([
    tslib_1.__param(0, context_1.inject('dispatchURL')),
    tslib_1.__param(1, context_1.inject('pocketSessionBlockFrequency')),
    tslib_1.__param(2, context_1.inject('pocketBlockTime')),
    tslib_1.__param(3, context_1.inject('clientPrivateKey')),
    tslib_1.__param(4, context_1.inject('clientPassphrase')),
    tslib_1.__param(5, context_1.inject(SequenceActions.FIND_ROUTE)),
    tslib_1.__param(6, context_1.inject(SequenceActions.PARSE_PARAMS)),
    tslib_1.__param(7, context_1.inject(SequenceActions.INVOKE_METHOD)),
    tslib_1.__param(8, context_1.inject(SequenceActions.SEND)),
    tslib_1.__param(9, context_1.inject(SequenceActions.REJECT)),
    tslib_1.__metadata("design:paramtypes", [String, Number, Number, String, String, Function, Function, Function, Function, Function])
], GatewaySequence);
exports.GatewaySequence = GatewaySequence;
//# sourceMappingURL=sequence.js.map