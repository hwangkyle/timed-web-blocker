const currTabInRules = async () => {
    let dict = await chrome.storage.local.get('urlInfo');
    dict = dict.urlInfo;
    let tab;
    for (let entry of Object.entries(dict)) {
        tab = await chrome.tabs.query({active:true,lastFocusedWindow:true,url:entry[1].urlPatterns});
        if (tab[0]) return entry[0];
    }
    return undefined;
};

const resetRules = async () => {
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

const onChangeResetTime = async () => {
    chrome.alarms.clearAll();
    let time = await chrome.storage.local.get('resetTime');
    time = time.resetTime;
    let [hr,mn] = time.split(':');
    hr = Number(hr);
    mn = Number(mn);
    let d = new Date();

    // compare current time to resetTime
    if (d.getHours() > hr || (d.getHours()===hr && d.getMinutes()>mn))
        d.setDate(d.getDate()+1);
    d.setHours(hr);
    d.setMinutes(mn);
    d.setSeconds(0);

    chrome.alarms.create('',{
        when : d.getTime()
    });
    chrome.alarms.onAlarm.addListener(alarm => {
        resetRules();
        d.setDate(d.getDate()+1);
        chrome.alarms.create('',{
            when : d.getTime()
        });
    });
};