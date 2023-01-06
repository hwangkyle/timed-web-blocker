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
    const e = $("#site-list");

    chrome.declarativeNetRequest.getDynamicRules(async rules => {
        let urlInfo = await chrome.storage.local.get('urlInfo');
        urlInfo = urlInfo.urlInfo;
        e.empty();
        rules.forEach(obj => {
            let urlFilter = obj.condition.urlFilter;
            e.append(`
                <li class='site-li' id="${urlFilter}">
                    <div class="time-form">
                        <input type="text" class="site-time" size="1" placeholder=${urlInfo[urlFilter] ? msToMin(urlInfo[urlFilter].maxTime) : 0}>
                        <span>mins</span>
                        <input type="button" class="time-submit" value="Confirm">
                    </div>
                    <p>${urlFilter}</p>
                    <button class="remove-button">X</button>
                </li>
            `);
        });
        $(".remove-button").click(removeBlockedSite);
        $(".site-time").on('keypress', changeTime2);
        $(".time-submit").click(changeTime1);
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

const _changeTime = (domain, el) => {
    let time = el.value;
    el.value = "";
    if (isNaN(time) || time === "" || time < 0) return;

    el.setAttribute("placeholder",time);

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
// NEEDS TO USE THE function KEYWORD, NOT =>
function changeTime1() {
    const domain = this.parentNode.parentNode.id;
    const el = this.parentNode.firstElementChild;
    _changeTime(domain, el);
}
// NEEDS TO USE THE function KEYWORD, NOT =>
function changeTime2(e) {
    if (e.which!='13') return;
    const domain = this.parentNode.parentNode.id;
    const el = this.parentNode.firstElementChild;
    _changeTime(domain, el);
}

const addSite = () => {
    let el = $('#site-input')[0];
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
                "action": { "type": "allow", "redirect": { "extensionPath": "/../html/blocked.html" } },
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
    $("#site-submit")[0].addEventListener("click", addSite);
    let adultSiteSwitch = $(".switch input")[0];
    chrome.storage.local.get('blockAdultSites', response => {
        adultSiteSwitch.checked = response.blockAdultSites;
        blockAdultSites(adultSiteSwitch);
    });
    adultSiteSwitch.addEventListener("click", function(){blockAdultSites(this)});
    let timeEl = $("#reset-time")[0];
    chrome.storage.local.get('resetTime', result => timeEl.value = result.resetTime);
    timeEl.addEventListener("input", _ => {
        chrome.storage.local.set({'resetTime': timeEl.value}, _ => onChangeResetTime());
    });
    drawList();
});


const _d = {
    get() {
        chrome.storage.local.get(null, r => console.log(r));
        chrome.declarativeNetRequest.getDynamicRules(r => console.log(r));
    },

    test(block=false, sites=['youtube.com', 'yahoo.com', 'reddit.com']) {
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
            let urls = rules.map(rule => rule.condition.urlFilter);
            for(let i=0;i<sites.length;++i)if(urls.indexOf(sites[i])>-1){sites.splice(i,1);--i;}
            urls.push(...sites);
            let newRules = { addRules:[], removeRuleIds: [] };
            for (let i=1; i<=urls.length; ++i) {
                newRules.addRules.push({
                    "id": i,
                    "priority": 1,
                    "action": { "type": block?"block":"allow" },
                    "condition": { "urlFilter": urls[i-1], "resourceTypes": ["main_frame"] }
                })
                newRules.removeRuleIds.push(i);
            }
            chrome.declarativeNetRequest.updateDynamicRules(newRules, drawList);
        });
    },

    directBlock(url) {
        chrome.declarativeNetRequest.getDynamicRules(rules => {
            chrome.declarativeNetRequest.updateDynamicRules({
                addRules : [{
                    "id": rules.length+1,
                    "priority": 1,
                    "action": { "type": "block" },
                    "condition": { "urlFilter": url, "domains":[url], "resourceTypes": ["main_frame"] }
                }]
            }, drawList);
        });
    },

    redirect(url) {
        chrome.declarativeNetRequest.getDynamicRules(rules => {
            chrome.declarativeNetRequest.updateDynamicRules({
                addRules : [{
                    "id": rules.length+1,
                    "priority": 1,
                    "action": { "type": "redirect", "redirect": { "extensionPath": "/../blocked/blocked.html" } },
                    "condition": { "urlFilter": url, "resourceTypes": ["main_frame"] }
                }]
            }, drawList);
        });
    },

    reset() {
        chrome.storage.local.clear();
        chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[1,2,3,4,5,6,7,8,9,10]});
        chrome.storage.local.get(null, result => {
            let items = {'currTabInfo':{}};
            if (!result.urlInfo) items['urlInfo'] = {};
            if (!result.resetTime) items['resetTime'] = "00:00";
            chrome.storage.local.set(items, _=>{ onChangeResetTime(); drawList(); });
        });
    },

    rt(block=true) { _d.reset(); setTimeout(()=>_d.test(block), 100);  }
}