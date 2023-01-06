// code to run when first opening browser
import { currTabInRules, onChangeResetTime } from '../util/helpersBackground.js';

chrome.storage.local.get(null, result => {
    let items = {'currTabInfo':{}};
    if (!result.urlInfo) items['urlInfo'] = {};
    if (!result.resetTime) items['resetTime'] = "00:00";
    if (!result.blockAdultSites) items['blockAdultSites'] = false;
    chrome.storage.local.set(items, _ => {
        onChangeResetTime();
        if (result.blockAdultSites)
            chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds : ['1'] });
        else
            chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds : ['1'] });
    });
});

const blockSite = async (url, refTime) => {
    let rules = await chrome.declarativeNetRequest.getDynamicRules();
    console.log(rules);
    let newRule = { addRules:[], removeRuleIds:[] };
    for (let rule of rules) {
        if (rule.condition.urlFilter === url) {
            rule.action.type = "redirect";
            rule.priority = 2;
            newRule.addRules.push(rule);
            newRule.removeRuleIds.push(rule.id);
            break;
        }
    }
    chrome.declarativeNetRequest.updateDynamicRules(newRule, chrome.tabs.reload);
    chrome.storage.local.get('urlInfo', r=>{
        let urlInfo = r.urlInfo;
        urlInfo[url].blocked=true;
        urlInfo[url].currTime += Date.now() - refTime;
        chrome.storage.local.set({'urlInfo':r.urlInfo});
    })
}

const setTabInfo = async (url, urlInfo) => {
    if (!url || urlInfo.blocked) { chrome.storage.local.set({'currTabInfo':{}}); return; }

    // set up the timer for the current tab
    let refTime = Date.now();
    let checkTime = refTime - urlInfo.currTime;
    let intervalId  = setInterval(function(){
        if (Date.now() - checkTime > urlInfo.maxTime) {
            clearInterval(intervalId);
            blockSite(url, refTime);
        }
    },500);

    let currTabInfo = {
        url:url,
        refTime:refTime,
        intervalId:intervalId
    };
    chrome.storage.local.set({'currTabInfo':currTabInfo});
}

async function update() {
    const url = await currTabInRules();

    const response = await chrome.storage.local.get(['currTabInfo', 'urlInfo']);
    let prevTabInfo = response.currTabInfo;
    let urlInfo = response.urlInfo;

    if (url) { // if current tab is on the rules list

        // if the current and previous tab are the same
        // then don't do anything. keep the time going.
        if (url === prevTabInfo.url)
            return;

        // if the current site is blocked, i.e. the time has reached the maximum
        // NOTE: i think urlInfo[url] is repetitive
        if (urlInfo[url] && urlInfo[url].blocked) {
            setTabInfo(url, urlInfo[url]);
            chrome.tabs.reload(); // so that the blocked page shows instead
            return;
        }
    }

    // if the previous tab was not on the rules list
    // then call setTabInfo with current url--no need to close off the previous one
    if (!prevTabInfo.url) {
        setTabInfo(url, urlInfo[url]);
        return;
    }

    clearInterval(prevTabInfo.intervalId);

    // if the previous tab is on the list and it is not blocked,
    // then update the time
    if (prevTabInfo.url && !urlInfo[prevTabInfo.url].blocked)
        urlInfo[prevTabInfo.url].currTime += Date.now() - prevTabInfo.refTime;

    chrome.storage.local.set({'urlInfo': urlInfo});
    setTabInfo(); // purposely undefined
}

chrome.tabs.onActivated.addListener(async activeInfo => {
    console.log("onActivated"); // DEBUG
    update();
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // console.log("onUpdated"); // DEBUG
    // this if statement is done bc I only want this to be called once
    // without this, onUpdated gets called multiple times
    // 'loading' is chosen bc I want it called asap
    // NOTE: still gets called multiple times sometimes, but it's better with than without
    if (changeInfo.status === 'loading') {
        console.log("onUpdated -> loading"); // DEBUG
        update();
    }
});

chrome.windows.onRemoved.addListener(windowId => {

})