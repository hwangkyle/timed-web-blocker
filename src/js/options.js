const isValidUrl = urlString => {
    // var urlPattern = new RegExp('^(https?:\\/\\/)?'+ // validate protocol
    // '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // validate domain name
    // '((\\d{1,3}\\.){3}\\d{1,3}))'+ // validate OR ip (v4) address
    // '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // validate port and path
    // '(\\?[;&a-z\\d%_.~+=-]*)?'+ // validate query string
    // '(\\#[-a-z\\d_]*)?$','i'); // validate fragment locator
    // return !!urlPattern.test(urlString);
    let urlObj;
    
    try {
        if (urlString.indexOf('://') === -1) urlObj = new URL("https://"+urlString);
        else urlObj = new URL(urlString);
    } catch (e) {
        return false;
    }

    if (urlObj.hostname.length > 63||
        !/^(([a-z\d]([a-z\d-]*[a-z\d])*)\.)+[a-z]{2,}$/.test(urlObj.hostname)||
        !/^\/[\w\-:%.~!\$&'\(\)\*\+,;=\/\?@]*$/.test(urlObj.pathname))
        return false;
    return true;
}

const msToMin = ms => ms/(1000*60);

function drawList() {
    const e = document.querySelector("#site-list");

    chrome.declarativeNetRequest.getDynamicRules(async rules => {
        let urlInfo = await chrome.storage.local.get('urlInfo');
        urlInfo = urlInfo.urlInfo;
        e.innerHTML = "";
        rules.forEach(obj => {
            let urlFilter = obj.condition.urlFilter;
            e.innerHTML += `
                <li class='site-li' id="${urlFilter}">
                    <div class="time-form">
                        <input type="text" class="site-time" size="1" placeholder=${urlInfo[urlFilter] ? msToMin(urlInfo[urlFilter].maxTime) : 0}>
                        <span>mins</span>
                        <input type="button" class="time-submit" value="Confirm">
                    </div>
                    <p>${urlFilter}</p>
                    <button class="remove-button">X</button>
                </li>
            `;
        });
        document.querySelectorAll(`.remove-button`).forEach(function(el) { el.addEventListener('click', removeBlockedSite) });
        document.querySelectorAll(`.site-time`).forEach(function(el) { el.addEventListener('keypress', changeTime) });
        document.querySelectorAll(`.time-submit`).forEach(function(el) { el.addEventListener('click', changeTime) });
    });
}

// NEEDS TO USE THE function KEYWORD, NOT =>
// domain GUARANTEED to exist
function removeBlockedSite() {
    const domain = this.parentNode.id;

    chrome.storage.local.get('urlInfo', result => {
        delete result.urlInfo[domain];
        chrome.storage.local.set({'urlInfo': result.urlInfo})
    });

    chrome.declarativeNetRequest.getDynamicRules(rules => {
        let index = -1;
        for (let i=0; i<rules.length; i++)
            if (rules[i].condition.urlFilter === domain) {
                index = i;
                break;
            }
            
        // index !== -1 assumed, i.e. domain exists in rules is assumed
        rules.splice(index, 1);
        rules.forEach((_,i) => rules[i].id = i+1);
        let ids = [];
        for (let i=1; i<=rules.length+1; i++) ids.push(i);
        chrome.declarativeNetRequest.updateDynamicRules({ addRules:rules, removeRuleIds:ids }, drawList);
    });
}

function changeTime(e) {
    if (e.key && e.key !== "Enter") return;

    const domain = this.parentNode.parentNode.id;
    const el = this.parentNode.firstElementChild;

    let time = el.value;
    el.value = "";
    if (isNaN(time) || time === "" || time < 0) return;

    el.setAttribute("placeholder", time);

    time = Number(time);
    chrome.storage.local.get('urlInfo', result => {
        let urlInfo = result.urlInfo;
        urlInfo[domain].maxTime = time*60*1000;
        if (urlInfo[domain].currTime < urlInfo[domain].maxTime && urlInfo[domain].blocked) {
            urlInfo[domain].blocked = false;
            chrome.declarativeNetRequest.getDynamicRules(rules => {
                for (let rule of rules) {
                    if (rule.condition.urlFilter === domain) {
                        rule.action.type = "allow";
                        rule.priority = 1;
                        chrome.declarativeNetRequest.updateDynamicRules({
                            addRules:[rule],
                            removeRuleIds:[rule.id]
                        });
                        break;
                    }
                }
            });
        }
        chrome.storage.local.set({'urlInfo': urlInfo});
    });
};

const addSite = () => {
    let el = document.querySelector('#site-input');
    let v = el.value;
    if (v == "") return;

    let sites = v.split('\n');
    for (let i=0; i<sites.length; ++i) if (!isValidUrl(sites[i])) sites.splice(i, 1);
    el.value = "";
    if (sites.length===0) return;

    chrome.storage.local.get('urlInfo', result => {
        sites.forEach(site => {
            if (!result.urlInfo[site]) result.urlInfo[site] = {
                maxTime : 0,
                currTime : 0,
                urlPatterns : fToP(site),
                blocked : false
            };
        });
        chrome.storage.local.set({'urlInfo': result.urlInfo});
    });

    chrome.declarativeNetRequest.getDynamicRules(rules => {
        let newRules = { addRules:[], removeRuleIds: [] };
        let urls = []
        for (let [i,rule] of rules.entries()) {
            let id = i+1;
            rule.id = id;
            urls.push(rule.condition.urlFilter);
            newRules.addRules.push(rule);
            newRules.removeRuleIds.push(id);
        }

        sites = sites.filter(site => !urls.includes(site));

        // this is done just to get the ids
        for (let i=urls.length+1; i<=urls.length+sites.length; ++i) {
            newRules.addRules.push({
                "id": i,
                "priority": 1,
                "action": { "type": "allow", "redirect": { "extensionPath": "/src/html/blocked.html" } },
                "condition": { "urlFilter": sites[i-urls.length-1], "resourceTypes": ["main_frame"] }
            });
            newRules.removeRuleIds.push(i);
        }

        chrome.declarativeNetRequest.updateDynamicRules(newRules, drawList);
    });
}

// because matching urls via google's api doesn't use "filters" they use "patterns"..........
const fToP = f => {
    let index;
    
    // find <scheme>+"://"
    let scheme;
    index = f.indexOf('://');
    if (index === -1) scheme = "*://";
    else {
        scheme = f.slice(0, index+3);
        f = f.slice(index+3);
    }
    
    //find <host>
    let host;
    index = f.indexOf('/');
    if (index === -1) host = f;
    else {
        host = f.slice(0, index);
        f = f.slice(index);
    }

    // find <path>
    let path;
    if (index === -1) path = "/*"
    else path = f+"*";

    return [scheme+host+path, scheme+"*."+host+path];
}

function blockAdultSites(el) {
    if (el.checked) chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds : ['1'] });
    else chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds : ['1'] });
    chrome.storage.local.set({ blockAdultSites : el.checked });
}

document.addEventListener('DOMContentLoaded', () => {
    // chrome.storage.local.clear();
    document.querySelector("#site-submit").addEventListener("click", addSite);

    let adultSiteSwitch = document.querySelector(".switch input");
    chrome.storage.local.get('blockAdultSites', response => {
        adultSiteSwitch.checked = response.blockAdultSites;
        blockAdultSites(adultSiteSwitch);
    });
    adultSiteSwitch.addEventListener("click", function(){blockAdultSites(this)});

    let timeEl = document.querySelector("#reset-time");
    chrome.storage.local.get('resetTime', result => timeEl.value = result.resetTime);
    timeEl.addEventListener("input", () => {
        chrome.storage.local.set({'resetTime': timeEl.value}, onChangeResetTime);
    });

    drawList();
});