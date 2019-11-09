"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const logger_1 = require("@wdio/logger");
const reporter_1 = require("@wdio/reporter");
const crypto_1 = require("crypto");
const path = require("path");
const ReportPortalClient = require("reportportal-js-client");
const constants_1 = require("./constants");
const entities_1 = require("./entities");
const ReporterOptions_1 = require("./ReporterOptions");
const storage_1 = require("./storage");
const utils_1 = require("./utils");
const log = logger_1.default("wdio-reportportal-reporter");
class ReportPortalReporter extends reporter_1.default {
    constructor(options) {
        super(Object.assign({ stdout: true }, options));
        this.storage = new storage_1.Storage();
        this.rpPromisesCompleted = false;
        this.options = Object.assign(new ReporterOptions_1.default(), options);
        this.registerListeners();
    }
    get isSynchronised() {
        return this.rpPromisesCompleted;
    }
    set isSynchronised(value) {
        this.rpPromisesCompleted = value;
    }
    static sendLog(level, message) {
        utils_1.sendToReporter(constants_1.EVENTS.RP_LOG, { level, message });
    }
    static sendFile(level, name, content, type = "image/png") {
        utils_1.sendToReporter(constants_1.EVENTS.RP_FILE, { level, name, content, type });
    }
    static sendLogToTest(test, level, message) {
        utils_1.sendToReporter(constants_1.EVENTS.RP_TEST_LOG, { test, level, message });
    }
    static sendFileToTest(test, level, name, content, type = "image/png") {
        utils_1.sendToReporter(constants_1.EVENTS.RP_TEST_FILE, { test, level, name, content, type });
    }
    static testRetry(test) {
        utils_1.sendToReporter(constants_1.EVENTS.RP_TEST_RETRY, { test });
    }
    onSuiteStart(suite) {
        log.trace(`Start suite ${suite.title} ${suite.uid}`);
        const suiteStartObj = new entities_1.StartTestItem(suite.title, constants_1.TYPE.SUITE);
        const suiteItem = this.storage.getCurrentSuite();
        let parentId = null;
        if (suiteItem !== null) {
            parentId = suiteItem.id;
        }
        if (this.options.parseTagsFromTestTitle) {
            suiteStartObj.addTags();
        }
        suiteStartObj.description = this.sanitizedCapabilities;
        const { tempId, promise } = this.client.startTestItem(suiteStartObj, this.tempLaunchId, parentId);
        utils_1.promiseErrorHandler(promise);
        this.storage.addSuite(new entities_1.StorageEntity(suiteStartObj.type, tempId, promise, suite));
    }
    onSuiteEnd(suite) {
        log.trace(`End suite ${suite.title} ${suite.uid}`);
        const suiteItem = this.storage.getCurrentSuite();
        const finishSuiteObj = { status: constants_1.STATUS.PASSED };
        const { promise } = this.client.finishTestItem(suiteItem.id, finishSuiteObj);
        utils_1.promiseErrorHandler(promise);
        this.storage.removeSuite();
    }
    onTestStart(test, type = constants_1.TYPE.STEP) {
        log.trace(`Start test ${test.title} ${test.uid}`);
        if (this.storage.getCurrentTest()) {
            return;
        }
        const suite = this.storage.getCurrentSuite();
        const testStartObj = new entities_1.StartTestItem(test.title, type);
        testStartObj.retry = true;
        testStartObj.codeRef = this.specFile;
        if (this.options.parseTagsFromTestTitle) {
            testStartObj.addTags();
        }
        utils_1.addBrowserParam(this.sanitizedCapabilities, testStartObj);
        const { tempId, promise } = this.client.startTestItem(testStartObj, this.tempLaunchId, suite.id);
        utils_1.promiseErrorHandler(promise);
        this.storage.addTest(test.uid, new entities_1.StorageEntity(testStartObj.type, tempId, promise, test));
        return promise;
    }
    onTestPass(test) {
        log.trace(`Pass test ${test.title} ${test.uid}`);
        this.testFinished(test, constants_1.STATUS.PASSED);
    }
    onTestFail(test) {
        log.trace(`Fail test ${test.title} ${test.uid} ${test.error.stack}`);
        const testItem = this.storage.getCurrentTest();
        if (testItem === null) {
            this.onTestStart(test, constants_1.TYPE.BEFORE_METHOD);
        }
        this.testFinished(test, constants_1.STATUS.FAILED);
    }
    onTestSkip(test) {
        log.trace(`Skip test ${test.title} ${test.uid}`);
        const testItem = this.storage.getCurrentTest();
        if (testItem === null) {
            this.onTestStart(test);
        }
        this.testFinished(test, constants_1.STATUS.SKIPPED, new entities_1.Issue("NOT_ISSUE"));
    }
    testFinished(test, status, issue) {
        log.trace(`Finish test ${test.title} ${test.uid}`);
        const testItem = this.storage.getCurrentTest();
        if (testItem === null) {
            return;
        }
        const finishTestObj = new entities_1.EndTestItem(status, issue);
        if (status === constants_1.STATUS.FAILED) {
            const message = `${test.error.stack} `;
            finishTestObj.description = `❌ ${message}`;
            this.client.sendLog(testItem.id, {
                level: constants_1.LEVEL.ERROR,
                message,
            });
        }
        const { promise } = this.client.finishTestItem(testItem.id, finishTestObj);
        utils_1.promiseErrorHandler(promise);
        this.storage.removeTest(testItem);
    }
    // @ts-ignore
    onRunnerStart(runner, client) {
        log.trace(`Runner start`);
        this.isMultiremote = runner.isMultiremote;
        this.sanitizedCapabilities = runner.sanitizedCapabilities;
        this.client = client || new ReportPortalClient(this.options.reportPortalClientConfig);
        this.launchId = process.env.RP_LAUNCH_ID;
        this.specFile = runner.specs[0];
        const startLaunchObj = {
            description: this.options.reportPortalClientConfig.description,
            id: this.launchId,
            mode: this.options.reportPortalClientConfig.mode,
            tags: this.options.reportPortalClientConfig.tags,
        };
        const { tempId } = this.client.startLaunch(startLaunchObj);
        this.tempLaunchId = tempId;
    }
    onRunnerEnd() {
        return __awaiter(this, void 0, void 0, function* () {
            log.trace(`Runner end`);
            try {
                const finishPromise = yield this.client.getPromiseFinishAllItems(this.tempLaunchId);
                log.trace(`Runner end sync ${this.isSynchronised}`);
                return finishPromise;
            }
            catch (e) {
                log.error("An error occurs on finish test items");
                log.error(e);
            }
            finally {
                this.isSynchronised = true;
            }
        });
    }
    // @ts-ignore
    onBeforeCommand(command) {
        if (!this.options.reportSeleniumCommands || this.isMultiremote) {
            return;
        }
        const method = `${command.method} ${command.endpoint}`;
        if (!utils_1.isEmpty(command.body)) {
            const data = JSON.stringify(utils_1.limit(command.body));
            this.sendLog({ message: `${method} ${data}`, level: this.options.seleniumCommandsLogLevel });
        }
        else {
            this.sendLog({ message: `${method}`, level: this.options.seleniumCommandsLogLevel });
        }
    }
    // @ts-ignore
    onAfterCommand(command) {
        if (this.isMultiremote) {
            return;
        }
        const isScreenshot = utils_1.isScreenshotCommand(command) && command.result.value;
        const { autoAttachScreenshots, screenshotsLogLevel, seleniumCommandsLogLevel, reportSeleniumCommands } = this.options;
        if (isScreenshot) {
            if (autoAttachScreenshots) {
                const obj = {
                    content: command.result.value,
                    level: screenshotsLogLevel,
                    name: "screenshot.png",
                };
                this.sendFile(obj);
            }
        }
        if (reportSeleniumCommands) {
            if (command.body && !utils_1.isEmpty(command.result.value)) {
                delete command.result.sessionId;
                const data = JSON.stringify(utils_1.limit(command.result));
                this.sendLog({ message: `${data}`, level: seleniumCommandsLogLevel });
            }
        }
    }
    onHookStart(hook) {
        log.trace(`Start hook ${hook.title} ${hook.uid}`);
    }
    onHookEnd(hook) {
        log.trace(`End hook ${hook.title} ${hook.uid} ${JSON.stringify(hook)}`);
        if (hook.error) {
            const testItem = this.storage.getCurrentTest();
            if (testItem === null) {
                this.onTestStart(hook, constants_1.TYPE.BEFORE_METHOD);
            }
            this.testFinished(hook, constants_1.STATUS.FAILED);
        }
    }
    handleRetry(event) {
        const testItem = this.storage.getCurrentTest();
        if (testItem === null) {
            return;
        }
        const err = {
            stack: event.test.error,
        };
        const test = {
            error: err,
            title: testItem.wdioEntity.title,
            uid: testItem.wdioEntity.uid,
        };
        this.testFinished(test, constants_1.STATUS.FAILED);
    }
    sendLog(event) {
        const testItem = this.storage.getCurrentTest();
        if (testItem === null) {
            log.warn("Cannot send log message. There is no running tests");
            return;
        }
        const { promise } = this.client.sendLog(testItem.id, {
            level: event.level,
            message: String(event.message),
        });
        utils_1.promiseErrorHandler(promise);
    }
    sendFile({ level, name, content, type = "image/png" }) {
        const testItem = this.storage.getCurrentTest();
        if (!testItem) {
            log.warn(`Can not send file to test. There is no running tests`);
            return;
        }
        const { promise } = this.client.sendLog(testItem.id, { level }, { name, content, type });
        utils_1.promiseErrorHandler(promise);
    }
    sendLogToTest({ test, level, message }) {
        return __awaiter(this, void 0, void 0, function* () {
            const testObj = this.storage.getStartedTests().reverse().find((startedTest) => {
                return startedTest.wdioEntity.title === test.title;
            });
            if (!testObj) {
                log.warn(`Can not send log to test ${test.title}`);
                return;
            }
            const rs = yield testObj.promise;
            const saveLogRQ = {
                itemId: rs.uuid,
                item_id: rs.id,
                level,
                message,
                time: this.now(),
            };
            const url = [this.client.baseURL, "log"].join("/");
            const promise = this.client.helpers.getServerResult(url, saveLogRQ, { headers: this.client.headers }, "POST");
            utils_1.promiseErrorHandler(promise);
        });
    }
    sendFileToTest({ test, level, name, content, type = "image/png" }) {
        return __awaiter(this, void 0, void 0, function* () {
            const testObj = this.storage.getStartedTests().reverse().find((startedTest) => {
                return startedTest.wdioEntity.title === test.title;
            });
            if (!testObj) {
                log.warn(`Can not send file to test ${test.title}`);
                return;
            }
            const rs = yield testObj.promise;
            const saveLogRQ = {
                itemId: rs.uuid,
                item_id: rs.id,
                level,
                message: "",
                time: this.now(),
            };
            // to avoid https://github.com/BorisOsipov/wdio-reportportal-reporter/issues/42#issuecomment-456573592
            const fileName = crypto_1.createHash("md5").update(name).digest("hex");
            const extension = path.extname(name) || ".dat";
            const promise = this.client.getRequestLogWithFile(saveLogRQ, { name: `${fileName}${extension}`, content, type });
            utils_1.promiseErrorHandler(promise);
        });
    }
    registerListeners() {
        // @ts-ignore
        process.on(constants_1.EVENTS.RP_LOG, this.sendLog.bind(this));
        // @ts-ignore
        process.on(constants_1.EVENTS.RP_FILE, this.sendFile.bind(this));
        // @ts-ignore
        process.on(constants_1.EVENTS.RP_TEST_LOG, this.sendLogToTest.bind(this));
        // @ts-ignore
        process.on(constants_1.EVENTS.RP_TEST_FILE, this.sendFileToTest.bind(this));
        // @ts-ignore
        process.on(constants_1.EVENTS.RP_TEST_RETRY, this.handleRetry.bind(this));
    }
    now() {
        return this.client.helpers.now();
    }
}
ReportPortalReporter.reporterName = "reportportal";
module.exports = ReportPortalReporter;