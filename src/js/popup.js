const e = $("#time")[0];
let intervalId;

// const test = $("#test")[0];
// chrome.storage.local.get(null, res => {
//     test.innerHTML+=JSON.stringify(res)+"<br><br>";
//     console.log(res)
// });
// chrome.alarms.getAll(res => {
//     test.innerHTML+=JSON.stringify(res)+"<br><br>";
//     console.log(res)
// });
// chrome.declarativeNetRequest.getDynamicRules(rules => {
//     test.innerHTML+=JSON.stringify(rules)
//     console.log(rules);
// });

const setTime = async _ => {
    let url = await currTabInRules();
    if (url === undefined) e.innerHTML = "This site is not blocked.";
    else {
        let response = await chrome.storage.local.get(['urlInfo', 'currTabInfo']);
        if (Object.keys(response.currTabInfo).length === 0) {
            e.innerHTML = "00:00:00";
            return;
        }
        let t = response.urlInfo[url].maxTime - response.urlInfo[url].currTime + response.currTabInfo.refTime;
        let mtt =  milliToTime(t - Date.now());
        e.innerHTML = mtt ? mtt : "00:00:00";
        intervalId = setInterval(() => { 
            console.log(intervalId)
            let mtt = milliToTime(t - Date.now());
            if (mtt) e.innerHTML = mtt;
            else {
                e.innerHTML = "00:00:00";
                clearInterval(intervalId);
            }
        }, 1000);
    }
}

const milliToTime = t => {
    if (t<0) return;
    let seconds = t/1000;
    let minutes = seconds/60;
    seconds = Math.floor(seconds%60);
    if (seconds<10) seconds = "0"+seconds;
    let hours = Math.floor(minutes/60);
    minutes = Math.floor(minutes%60);
    if (minutes<10) minutes = "0"+minutes;
    if (hours<10) hours = "0"+hours;
    return `${hours}:${minutes}:${seconds}`;
}

setTime();