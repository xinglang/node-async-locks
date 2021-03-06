'use strict';
var _ = require('lodash');

var tokenId = 0;

function elapsed() {
    return new Date() - this.start;
}

function set() {
    if (this.resetEvent) {
        this.resetEvent.set(this);
    }
}

/**
 * A Reset Event.
 * @constructor
 * @param {boolean} isSignaled - if true then the reset event starts signaled (all calls to wait will pass through)
 * @param {object} options - optional set of options for this reset event
 */
var ResetEvent = function (isSignaled, options) {
    this.queue = [];
    this.isSignaled = Boolean(isSignaled);
    this.options = _.extend({}, ResetEvent.defaultOptions, options);
};

ResetEvent.defaultOptions = {
    maxQueueSize: Infinity,
    overflowStrategy: 'this',
    autoResetCount: Infinity
};

/**
 * A function that is used to create a token. Override if needed.
 * @param {function} callback - The callback associated with the token.
 */
ResetEvent.prototype.createToken = function (callback) {
    return {
        id: tokenId++,
        isCanceled: false,
        callback: callback,
        elapsed: elapsed,
        start: new Date(),
        resetEvent: this,
        set: set
    };
};

/**
 * Removes items from the given queue based on the given options
 * @param {array} queue - The queue of tokens
 * @param {object} options - The options that control the reduction algorithm
 * @returns an array of the tokens which were removed from the queue
 */
ResetEvent.prototype.reduceQueue = function (queue, options) {
    var result = [];
    if ((typeof options.maxQueueSize !== 'number') || isNaN(options.maxQueueSize)) {
        return result;
    }

    if (queue.length > options.maxQueueSize) {
        if (options.overflowStrategy === 'last') {
            var last = queue.pop();
            while (queue.length && queue.length > (options.maxQueueSize - 1)) {
                result.unshift(queue.pop());
            }
            queue.push(last);
            return result;
        }

        if (options.overflowStrategy === 'first') {
            while (queue.length && queue.length > options.maxQueueSize) {
                result.push(queue.shift());
            }
            return result;
        }

        if (queue.length && options.overflowStrategy === 'this') {
            result.push(queue.pop());
            return result;
        }
    }

    return result;
};

/**
 * A function that is used to execute the user callback. Default implementation invokes the callback synchronously.
 * Override if needed.
 * @param {object} token - The the token which contains the callback to call.
 */
ResetEvent.prototype.executeCallback = function (token) {
    token.callback(token);
};

/**
 * Takes control over the reset event, callers to wait will wait until the reset event is reset.
 */
ResetEvent.prototype.reset = function () {

    if (this.isSignaled === false) {
        throw new Error('The reset event is already in a non signaled state');
    }

    this.isSignaled = false;
};

/**
 * Releases all the callbacks waiting on the reset event.
 */

ResetEvent.prototype.set = function () {
    var queueToken;

    if (this.isSignaled === true) {
        throw new Error('The reset event is already in a signaled state');
    }

    this.callbacksCount = this.options.autoResetCount;

    while (this.queue.length > 0) {
        queueToken = this.queue.shift();
        this.callbacksCount--;

        if (queueToken.timeoutId && this.callbacksCount > 0) {
            clearTimeout(queueToken.timeoutId);
        }

        if (queueToken.isCanceled) {
            this.callbacksCount++;
        } else {
            this.executeCallback(queueToken);
            if (this.callbacksCount === 0) {
                return;
            }
        }
    }
    this.isSignaled = true;
};

/**
 * Waits until the reset event becomes signaled then executes the callback.
 * If the reset event is signaled when wait is called, the callback is executed immediately.
 * @param {function} callback - the function to execute when the reset event becomes signaled
 * @param {number} [timeout] - The amount of time to wait in milliseconds before canceling the callback call.
 * The callback is of the form foo(token) (i.e. it will receive the acquired token as a parameter when called)
 * @returns {object} token - A token which can be used to cancel the callback and to track the elapsed time
 */
ResetEvent.prototype.wait = function (callback, timeout) {
    if (!_.isFunction(callback)) {
        throw new Error('Callback must be a function');
    }

    var token = this.createToken(callback);

    if (token === null || token === undefined) {
        throw new Error('Token cannot be null or undefined');
    }

    if (timeout) {
        token.timeoutId = setTimeout(function () {
            token.isCanceled = true;
            token.timeoutId = null;
        }, timeout);
    }

    if (this.isSignaled) {
        this.executeCallback(token);
        this.callbacksCount--;
        if (this.callbacksCount === 0) {
            this.isSignaled = false;
        }
    } else {
        this.queue.push(token);
    }

    var i, reducedTokens = this.reduceQueue(this.queue, this.options);
    for (i = 0; i < reducedTokens.length; i++) {
        reducedTokens[i].isCanceled = true;
        if (reducedTokens[i].timeoutId) {
            clearTimeout(reducedTokens[i].timeoutId);
        }
    }

    return token;
};

/**
 * Checks if this reset event is signaled. A signaled reset event executes all callbacks immediately.
 */
ResetEvent.prototype.isSignaled = function () {
    return this.isSignaled;
};

/**
 * Returns the number of pending callbacks
 */
ResetEvent.prototype.queueSize = function () {
    return this.queue.length;
};

/**
 * Do not use this function, it is for unit tests only
 * @private
 */
ResetEvent.__reset = function(){
    tokenId = 0;
};


module.exports = ResetEvent;
