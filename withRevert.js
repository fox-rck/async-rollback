const _ = require('lodash');
const Promise = require('bluebird');

function createPromise() {
  var resolve, reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  })
  return {promise, resolve, reject};
}

function getRevertParams({useValueGetterResponse, useUpdaterResponse, params}, initialValues, updaterResponse) {
  if (useValueGetterResponse) {
    return initialValues[reversedIndex];
  } else if (useUpdaterResponse) {
    return updaterResponse[reversedIndex];
  }
  return params;
}

function throwErrorOnRejection() {
  throw Error();
}

const setUpdateResponse = (updaterResponse, index, callback) => function setData(data) {
  updaterResponse[index] = data;
  callback(data);
}

/**
 * function is called when for updating
 * @param {Object} params
   @param params.globalResolve: called when all the request are completed
   @param params.globalReject: called after reverting all the updates.
   @param params.initialValues: pre update values array
   @param params.numOfUpdates: total updates to iterate upon
   @param params.updaterResponse: update responses array.
   @param params.updateConfigs: config array
   @param params.previousPromise: promise on which next then handler will be attached.
   @param params.index index on which update function will be called
 */
const callUpdateFunc = (globalResolve, globalReject, initialValues, numOfUpdates, updaterResponse, updateConfigs, previousPromise, index) => {
  const isLastUpdate = (numOfUpdates - 1) === index;
  previousPromise.then(() => {
    const {promise, resolve, reject} = isLastUpdate ? {} : createPromise();
    const {funcToExec, params} = updateConfigs[index].updater;
    const funcPromise = _.isFunction(funcToExec) ? funcToExec(params) : Promise.resolve();
    if (isLastUpdate) {
      return funcPromise.then(globalResolve, throwErrorOnRejection);
    } else {
      funcPromise.then(setUpdateResponse(updaterResponse, index, resolve), throwErrorOnRejection);
    }
    return callUpdateFunc(globalResolve, globalReject, initialValues, numOfUpdates, updaterResponse, updateConfigs, promise, index + 1);
  }).catch(revertUpdate({updateConfigs, initialValues, updaterResponse, revertFromIndex: index, globalResolve, globalReject}));
}

/**
 * function is called for reverting updates
 * @param {Object} params
   @param params.globalReject: called after reverting all the updates.
   @param params.initialValues: pre update values array
   @param params.updaterResponse: update responses array.
   @param params.previousPromise: promise on which next then handler will be attached.
   @param params.index: index to revert
 */
const callRevertFunc = (globalReject, initialValues, updaterResponse, updateConfigs, previousPromise, index) => {
  previousPromise.then(() => {
    const {promise, resolve, reject} = (index === 0) ? {} : createPromise();
    const {funcToExec} = updateConfigs[index].reverter;
    const paramsToSend = getRevertParams(updateConfigs[index].reverter, initialValues, updaterResponse);
    const funcPromise = _.isFunction(funcToExec) ? funcToExec(paramsToSend) : Promise.resolve();
    funcPromise.then(resolve, reject);
    return (index === 0) ? funcPromise.then(globalReject, throwErrorOnRejection) :
      callRevertFunc(globalReject, initialValues, updaterResponse, updateConfigs, promise, index - 1)
  }).catch(globalReject);
}

/**
 * function is called when reverting update
 * @param {Object} params
   @param {Object[]} params.updateConfigs: contains the request config.
   @param {Object[]} params.initialValues: pre update values array
   @param {number} params.revertFromIndex: index upto which we need to reset state
   @param {callback} params.globalResolve: called when all the request are completed
   @param {callback} params.globalReject: called after reverting all the updates.
 */
const revertUpdate = ({updateConfigs, initialValues, updaterResponse, revertFromIndex, globalResolve, globalReject}) => () => {
  if (revertFromIndex <= 0) {
    globalReject();
    return;
  }
  console.log('Reverting from index', revertFromIndex - 1);
  callRevertFunc(globalReject, initialValues, updaterResponse, updateConfigs, Promise.resolve(), revertFromIndex - 1);
}

/**
 * This function takes in config to executing request in series (on after other)
 * order depends on array.
 * @param {Object[]} updateConfigs: [
   @param {Object} updateConfigs[].valueGetter
   @param {Object} updateConfigs[].updater
   @param {string} updateConfigs[].valueGetter.funcToExec: func to get initialValues should return promise
   @param {Object} updateConfigs[].valueGetter.params: payload to send while executing funcToExec

  [
    {
      valueGetter: {funcToExec: '', params:  {} },
      updater: {funcToExec: '', params:  {} },
      reverter: {funcToExec: '', params:  {}, useUpdaterResponse: false, useValueGetterResponse: false}
    },
    {
      valueGetter: {funcToExec: '', params:  {} },
      updater: {funcToExec: '', params:  {} },
      reverter: {funcToExec: '', params:  {}, useUpdaterResponse: false, useValueGetterResponse: false}
    }
  ]
 */

const executeInSeries = (updateConfigs) => {
  let updaterResponse = [];
  const {promise, resolve, reject} = createPromise();
  const valueGetters = _.map(updateConfigs, ({valueGetter: {}}) => {
    const {funcToExec, params} = valueGetter;
    return _.isFunction(funcToExec) ? funcToExec(params) : Promise.resolve();
  });
  Promise.all(valueGetters).then((initialValues) => {
    const numOfUpdates = updateConfigs.length;
    callUpdateFunc(resolve, reject, initialValues, numOfUpdates, updaterResponse, updateConfigs, Promise.resolve(), 0);
  }).catch((error) => {
    console.log(error);
    reject(error);
  });
  return promise;
}

module.exports = executeInSeries;