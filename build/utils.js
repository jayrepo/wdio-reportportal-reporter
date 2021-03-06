"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const logger_1 = require("@wdio/logger");
const validator_1 = require("validator");
const stringify = require("json-stringify-safe");
const got_1 = require("got");
const OBJLENGTH = 10;
const ARRLENGTH = 10;
const STRINGLIMIT = 1000;
const STRINGTRUNCATE = 200;
const TAGS_PATTERN = /\B@[a-z0-9_-]+/gi;
const log = logger_1.default("wdio-reportportal-reporter");
exports.promiseErrorHandler = (promise) => {
    promise.catch((err) => {
        log.error(err);
    });
};
exports.isEmpty = (object) => !object || Object.keys(object).length === 0;
/**
 * Limit the length of an arbitrary variable of any type, suitable for being logged or displayed
 * @param  {Any} val Any variable
 * @return {Any} Limited var of same type
 */
exports.limit = (val) => {
    if (!val) {
        return val;
    }
    // Ensure we're working with a copy
    let value = JSON.parse(stringify(val));
    switch (Object.prototype.toString.call(value)) {
        case "[object String]":
            if (value.length > 100 && validator_1.default.isBase64(value)) {
                return `[base64] ${value.length} bytes`;
            }
            if (value.length > STRINGLIMIT) {
                return `${value.substr(0, STRINGTRUNCATE)} ... (${value.length - STRINGTRUNCATE} more bytes)`;
            }
            return value;
        case "[object Array]": {
            const { length } = value;
            if (length > ARRLENGTH) {
                value = value.slice(0, ARRLENGTH);
                value.push(`(${length - ARRLENGTH} more items)`);
            }
            return value.map(exports.limit);
        }
        case "[object Object]": {
            const keys = Object.keys(value);
            const removed = [];
            for (let i = 0, l = keys.length; i < l; i += 1) {
                if (i < OBJLENGTH) {
                    value[keys[i]] = exports.limit(value[keys[i]]);
                }
                else {
                    delete value[keys[i]];
                    removed.push(keys[i]);
                }
            }
            if (removed.length) {
                value._ = `${keys.length - OBJLENGTH} more keys: ${JSON.stringify(removed)}`;
            }
            return value;
        }
        default: {
            return value;
        }
    }
};
exports.addBrowserParam = (browser, testItem) => {
    if (browser) {
        const param = { key: "browser", value: browser };
        if (Array.isArray(testItem.parameters)) {
            testItem.parameters.push(param);
            return;
        }
        testItem.parameters = [param];
    }
};
exports.addDescription = (description, testItem) => {
    if (description) {
        testItem.description = description;
    }
};
exports.parseTags = (text) => ("" + text).match(TAGS_PATTERN) || [];
exports.isScreenshotCommand = (command) => {
    const isScrenshotEndpoint = /\/session\/[^/]*\/screenshot/;
    return isScrenshotEndpoint.test(command.endpoint);
};
exports.sendToReporter = (event, msg = {}) => {
    // @ts-ignore
    process.emit(event, msg);
};
exports.getBrowserstackURL = (capabilities) => __awaiter(void 0, void 0, void 0, function* () {
    const automationType = capabilities.app ? "app-automate" : "automate";
    try {
        const json = yield got_1.default
            .get(`https://api-cloud.browserstack.com/${automationType}/sessions/${capabilities.sessionId}.json`, {
            username: process.env.BROWSERSTACK_USERNAME,
            password: process.env.BROWSERSTACK_ACCESS_KEY,
        })
            .json();
        return json.automation_session.browser_url;
    }
    catch (e) {
        log.error(e);
        return "";
    }
});
