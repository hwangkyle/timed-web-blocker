const currTabInRules = async _ => {
    let dict = await chrome.storage.local.get('urlInfo');
    dict = dict.urlInfo;
    let tab;
    for (let entry of Object.entries(dict)) {
        tab = await chrome.tabs.query({active:true,lastFocusedWindow:true,url:entry[1].urlPatterns});
        if (tab[0]) return entry[0];
    }
    return undefined;
};

const resetRules = async _ => {
    let urlInfo = await chrome.storage.local.get('urlInfo');
    urlInfo = urlInfo.urlInfo;
    for (let url of Object.keys(urlInfo)) {
        urlInfo[url].blocked = false;
        urlInfo[url].currTime = 0;
    }
    chrome.storage.local.set({'urlInfo':urlInfo});

    let rules = await chrome.declarativeNetRequest.getDynamicRules();
    let newRule = { addRules:[], removeRuleIds:[] };
    for (let rule of rules) {
        rule.action.type = "allow";
        rule.priority = 1;
        newRule.addRules.push(rule);
        newRule.removeRuleIds.push(rule.id);
    }
    chrome.declarativeNetRequest.updateDynamicRules(newRule);
};

const onChangeResetTime = async _ => {
    chrome.alarms.clearAll();
    let time = await chrome.storage.local.get('resetTime');
    time = time.resetTime;
    let [hr,mn] = time.split(':');
    hr = Number(hr);
    mn = Number(mn);
    const currHr = new Date().getHours(), currMn = new Date().getMinutes();
    let dayOffset = hr < currHr || (hr === currHr && mn < currMn) ? 1 : 0;
    chrome.alarms.create('',{
        when : Date.UTC(
            new Date().getFullYear(),
            new Date().getMonth(),
            new Date().getDate()+dayOffset,
            hr,
            new Date().getTimezoneOffset()+mn
        )
    });
    chrome.alarms.onAlarm.addListener(alarm => {
        resetRules();
        let d = new Date();
        chrome.alarms.create('',{
            when : Date.UTC(
                d.getFullYear(),
                d.getMonth(),
                d.getDate()+dayOffset,
                hr,
                new Date().getTimezoneOffset()+mn
            )
        });
    });
};