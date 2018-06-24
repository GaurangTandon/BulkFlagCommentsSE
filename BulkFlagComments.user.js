// ==UserScript==
// @name         Bulk flag comments
// @version      1.0.0
// @description  flag comments in bulk easily via checkboxes
// @author       Gaurang Tandon
// @match        *://*.askubuntu.com/*
// @match        *://*.mathoverflow.net/*
// @match        *://*.serverfault.com/*
// @match        *://*.stackapps.com/*
// @match        *://*.stackexchange.com/*
// @match        *://*.stackoverflow.com/*
// @match        *://*.superuser.com/*
// @exclude      *://chat.stackexchange.com/*
// @exclude      *://chat.stackoverflow.com/*
// @exclude      *://api.stackexchange.com/*
// @exclude      *://blog.stackexchange.com/*
// @exclude      *://blog.stackoverflow.com/*
// @exclude      *://data.stackexchange.com/*
// @exclude      *://elections.stackexchange.com/*
// @exclude      *://openid.stackexchange.com/*
// @exclude      *://stackexchange.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    function $(selector){
        var elms = document.querySelectorAll(selector), elm, len = elms.length;

		// cannot always return a NodeList/Array
		// as properties like firstChild, lastChild will only be able
		// to be accessed by elms[0].lastChild which is too cumbersome
        if(len === 0) return null;
		else if (len === 1) {
			elm = elms[0];
			// so that I can access the length of the returned
			// value else length if undefined
			elm.length = 1;
			return elm;
		}
		else return elms;
    }

    function $ID(id){
        return document.getElementById(id);
    }

    function $Class(id){
        return document.getElementsByClassName(id);
    }

    function hasClass(node, className){
        return node.className && new RegExp("(^|\\s)" + className + "(\\s|$)").test(node.className);
    }

    function forEach(nodeList, fn){
        if(!nodeList) return;

        var i = 0, len = nodeList.length;

        for(; i < len; i++) fn.call(this, nodeList[i] || nodeList);

    }

    // get parent based on selector
    function getParent(node, selector){
        var parent = node.parentNode;

        while(parent){
            if(parent.matches(selector)) return parent;

            parent = parent.parentNode;
        }

        return null;
    }

    function processTokenOnSAPage(){
        var storedToken = GM_getValue(ACCESS_TOKEN_KEY),
            postText = $ID("answer-7936").querySelector(".post-text"),
            hashTokenMatch = window.location.hash.match(/access_token=(.*?)(&|$)/),
            accessToken = hashTokenMatch && hashTokenMatch[1];

        if(!storedToken && !accessToken){
            postText.innerHTML += "<p><b>Please register for an access token at <a href='https://stackoverflow.com/oauth/dialog?client_id=12678&scope=write_access,no_expiry&redirect_uri=stackapps.com/a/7936'>this link.</a></b></p>"
            return;
        }

        // user was redirected from the Auth page, update stored token
        if(accessToken) {
            GM_setValue(ACCESS_TOKEN_KEY, storedToken = accessToken);
        }

        postText.innerHTML += "<p>Thanks, you successfully registered for an access token! Your access token is \"" + storedToken + "\". Please keep it private.";
    }

    var PROCESSED_CLASS = "cflag-processed",
        CHECKBOX_GROUP = "listFlagged",
        CHECKBOX_WRAPPER_DIV_CLASS = "comment-bulk-flagging",
        BULK_FLAG_OPTIONS_CLASS = "bulk-flag-options",
        ACCESS_TOKEN_KEY = "comment-bulk-flag-access-token",
        ACCESS_TOKEN = "",
        APP_KEY = "EruI7DJUhSBCSty4NlMqGw((",
        TIME_DELAY_BETWEEN_FLAGS = 5000,
        UNLOAD_WARNING = "You still have pending flags. Are you sure you wish to exit?",
        USER_ID = 0,
        SITE_NAME = "",
        FLAG_MAP = {
            "nlg": "no longer needed",
            "ra": "rude or abusive"
        },
        // list of comment IDs
        currentFlagQueue = {
            "ra": [],
            "nlg": []
        },
        flagCurrentlyRaised = false;

    if(/stackapps/.test(window.location) && /7935/.test(window.location)) processTokenOnSAPage();
    else ACCESS_TOKEN = GM_getValue(ACCESS_TOKEN_KEY);

    // [site].stackexchange.com OR [site].com
    (function getCurrentSiteName(){
        var URL = window.location.href,
            shortSite = URL.match(/(^|\/)([a-z]+)\.stackexchange/),
            customSite = URL.match(/([a-z]+)\.com/);

        SITE_NAME = (shortSite && shortSite[2]) || (customSite && customSite[1]) || null;
    })();

    (function fetchUserID(){
        var fetchID = new XMLHttpRequest();
        fetchID.open("GET", "https://api.stackexchange.com/2.2/me?order=desc&sort=reputation&key=" + APP_KEY + "&access_token=" + ACCESS_TOKEN + "&site=" + SITE_NAME);
        fetchID.addEventListener("load", function(){
            USER_ID = JSON.parse(this.response).items[0].user_id;
            console.log("Your user id is " + USER_ID);
        });

        fetchID.send();
    })();

    // While I am returning a custom string, they are no longer supported
    // https://developer.mozilla.org/en-US/docs/Web/API/WindowEventHandlers/onbeforeunload
    window.addEventListener("beforeunload", function(e){
        if(flagCurrentlyRaised){
            e.returnValue = UNLOAD_WARNING;
            return UNLOAD_WARNING;
        }
    });

    function displaySuccess(commentID){
        var commentLI = $ID("comment-" + commentID),
            flagBtn = commentLI.querySelector(".comment-flag"),
            checkbox = commentLI.querySelector("input[type=\"checkbox\"]");

        flagBtn.classList.add("flag-on", "comment-flag-indicator");
        flagBtn.title = "You have already flagged this comment";
        checkbox.parentNode.removeChild(checkbox);
        unwrapCommentLabel($("label[for=\"flag" + commentID + "\"]"));
    }

    function isSelfComment(commentID){
        var userIDCurrent = $("#comment-" + commentID + " .comment-user").href.match(/\/(\d+)\//)[1];

        return (+userIDCurrent === USER_ID);
    }

    function castDeleteRequest(commentID){
        var deleteComment = new XMLHttpRequest();
        deleteComment.open("POST", "https://api.stackexchange.com/2.2/comments/" + commentID + "/delete?key=" + APP_KEY + "&site=" + SITE_NAME + "&id=" + commentID + "&access_token=" + ACCESS_TOKEN);
        deleteComment.send();
        deleteComment.addEventListener("load", function(){
            var response;
            try{
                response = JSON.parse(this.response);
                if(response.error_name) {
                    console.warn("Error deleting self-flagged-comment", response);
                }
            }catch(e){
                console.warn("Could not parse response!", response);
            }finally{
                if(!response || !response.error_name) {
                    console.log("Success!", response);
                    displaySuccess(commentID);
                }
            }
        });
    }

    function hasNextFlag(){
        var reasons = Object.keys(FLAG_MAP);

        for(var i = 0, len = reasons.length; i < len; i++)
            if(currentFlagQueue[reasons[i]].length)
                return true;

        return false;
    }

    function setFlagOptionsHandler(reason, commentID){
        return function(){
            // interestingly, it will allow you to raise a flag even on
            // your own flags (doesn't stop under flag_options), but then
            // gives a 400 error on POST request
            function raiseFlag(){
                var flag = new XMLHttpRequest();
                flag.open("POST", "https://api.stackexchange.com/2.2/comments/" + commentID + "/flags/add", true);
                flag.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
                flag.onload = function(data){
                    var response;
                    try{
                        response = JSON.parse(this.response);
                        if(response.error_name) {
                            //  cast delete vote self-comment
                            if(isSelfComment(commentID)) castDeleteRequest(commentID);
                            else console.warn("Error received!", response);
                        }
                    }catch(e){
                        console.warn("Could not parse response!", response);
                    }finally{
                        if(!response || !response.error_name) {
                            console.log("Success!", response);
                            displaySuccess(commentID);
                        }
                    }

                    if(hasNextFlag()) setTimeout(flagNextComment, TIME_DELAY_BETWEEN_FLAGS);
                    else flagCurrentlyRaised = false;
                };
                flag.send("key=" + APP_KEY + "&site=" + SITE_NAME + "&option_id=" + flagID + "&access_token=" + ACCESS_TOKEN);
            }

            var data = JSON.parse(this.response), flagsAvailable = data.items, flagID = -1;

            for(var i = 0, len = flagsAvailable.length; i < len; i++){
                if(reason === flagsAvailable[i].title){
                    flagID = flagsAvailable[i].option_id;
                    break;
                }
            }

            if(flagID !== -1) raiseFlag();            
        };
    }

    function flagNextComment(){
        var reasons = Object.keys(FLAG_MAP), reason, commentID, req;
        flagCurrentlyRaised = false;

        for(var i = 0, len = reasons.length; i < len; i++){
            reason = reasons[i];
            if(!currentFlagQueue[reason].length) continue;

            commentID = currentFlagQueue[reason].pop();
            req = new XMLHttpRequest();

            req.open("GET", "https://api.stackexchange.com/2.2/comments/" + commentID + "/flags/options?key=" + encodeURIComponent("EruI7DJUhSBCSty4NlMqGw((") + "&site=" + SITE_NAME + "&access_token=" + encodeURIComponent(ACCESS_TOKEN), true);
            req.addEventListener("load", setFlagOptionsHandler(FLAG_MAP[reason], commentID));
            req.send();

            flagCurrentlyRaised = true;

            break; // do not flag for more than one reason at once
        }
    }

    // reason - "ra" or "nlg"
    function flagBulk(commentIDs, reason){
        if(!SITE_NAME) return;

        currentFlagQueue[reason] = currentFlagQueue[reason].concat(commentIDs);

        if(!flagCurrentlyRaised) flagNextComment();
    }

    function addBulkFlag(commentsDIV){
        function divWrapperForCommentAction(commentID){
            var inpLabel = createInput(groupFlagType, "", commentID, CHECKBOX_GROUP),
                div = document.createElement("div"),
                a = document.createElement("a");

            inpLabel.firstElementChild.id = "flag" + commentID;
            div.className = CHECKBOX_WRAPPER_DIV_CLASS;

            // the UI structure requires me to wrap
            // any content in div > a
            a.appendChild(inpLabel);
            div.appendChild(a);

            return div;
        }

        function createInput(type, text, value, groupName){
            var inp = document.createElement("input"),
                label = document.createElement("label");

            inp.type = type;
            inp.value = value;
            inp.name = groupName;

            label.appendChild(inp);
            label.innerHTML += " " + text;

            return label;
        }

        function createSelectAllButton(){
            var btn = document.createElement("button");
            btn.innerHTML = "select all";
            btn.addEventListener("click", function(event){
                var uncheckedElements = $("[name=\"" + CHECKBOX_GROUP + "\"]:not(:checked)"),
                    checkedState = !!uncheckedElements;

                forEach($("[name=\"" + CHECKBOX_GROUP + "\"]"), function(checkbox){
                    checkbox.checked = checkedState;
                });
            }, true);

            return btn;
        }

        function createFlagButton(){
            var btn = document.createElement("button");
            btn.innerHTML = "flag";
            btn.addEventListener("click", function(event){
                var commentIDsToFlag = [],
                    checkedComments = $("[name=\"" + CHECKBOX_GROUP + "\"]:checked"),
                    flagReason = $("[name=\"" + flagOptionsGroup + "\"]:checked").value,
                    postID = commentsDIV.id.match(/\d+/)[0];

                if(!checkedComments) alert("No comment selected");

                forEach(checkedComments, function(checkbox){
                    commentIDsToFlag.push(checkbox.value);
                });

                flagBulk(commentIDsToFlag, flagReason);
            });

            return btn;
        }

        var flagOptionsContainer = document.createElement("div"),
            flagOptionsGroup = "flagOptions", flagOptionsType = "radio",
            raInput = createInput(flagOptionsType, "rude and abusive", "ra", flagOptionsGroup),
            nlgInput = createInput(flagOptionsType, "no longer needed", "nlg", flagOptionsGroup),
            selectAllBtn = createSelectAllButton(),
            flagBtn = createFlagButton();

        flagOptionsContainer.appendChild(raInput);
        flagOptionsContainer.appendChild(nlgInput);
        flagOptionsContainer.appendChild(selectAllBtn);
        flagOptionsContainer.appendChild(flagBtn);
        nlgInput.firstElementChild.checked = true;

        flagOptionsContainer.className = BULK_FLAG_OPTIONS_CLASS;

        commentsDIV.insertBefore(flagOptionsContainer, commentsDIV.firstElementChild);

        var commentList = commentsDIV.querySelector("ul").children, groupFlagType = "checkbox";

        // assume that the user can flag only those comments which are visible
        // if a user wishes to flag comments hidden under a "show X more comments" link
        // they should open those comments first and only THEN click our button
        forEach(commentList, function(comment){
            var actions = comment.querySelector(".comment-actions"),
                commentID = comment.dataset.commentId,
                divWrapper = divWrapperForCommentAction(commentID),
                spanCommentText = actions.nextElementSibling.querySelector(".comment-copy"),
                spanReplacement = document.createElement("label");

            // make it second element
            actions.insertBefore(divWrapper, actions.children[1]);

            // enable click anywhere on comment to highlight checkbox
            spanReplacement.innerHTML = spanCommentText.innerHTML;
            spanReplacement.setAttribute("for", "flag" + commentID);
            spanReplacement.className = spanCommentText.className;
            spanCommentText.parentNode.replaceChild(spanReplacement, spanCommentText);
        });

        window.location.href = "#" + commentsDIV.id;
    }

    function unwrapCommentLabel(label){
        var commentText = label.innerHTML, parent = label.parentNode;
        parent.removeChild(label);
        parent.innerHTML = "<span class=\"comment-copy\">" + commentText + "</span>" + parent.innerHTML;
    }

    function removeBulkFlag(commentsDIV){
        var checkboxDIVs = commentsDIV.querySelectorAll("." + CHECKBOX_WRAPPER_DIV_CLASS);
        forEach(checkboxDIVs, function(div){
            div.parentNode.removeChild(div);
        });

        var optionsDIV = $Class(BULK_FLAG_OPTIONS_CLASS);
        optionsDIV.parentNode.removeChild(optionsDIV);

        // unwrap the label
        forEach($("label[for^=\"flag\""), unwrapCommentLabel);
    }

    // commentsDIV -> generally `.comments`
    function toggleBulkFlag(commentsDIV){
        if(!ACCESS_TOKEN) {
            if(confirm("You first need an access token. Press OK to navigate to StackApps to get it."))
                window.open("https://stackapps.com/a/7936");
            return;
        }

        if(hasClass(commentsDIV, PROCESSED_CLASS)){
            removeBulkFlag(commentsDIV);
            commentsDIV.classList.remove(PROCESSED_CLASS);
        }else {
            addBulkFlag(commentsDIV);
            commentsDIV.classList.add(PROCESSED_CLASS);
        }
    }

    setInterval(function(){
        var nodes = $(".post-menu:not(." + PROCESSED_CLASS + ")");

        forEach(nodes, function(node){
            var a = document.createElement("A"), commentsDIV;
            a.innerHTML = a.className = "cflag";
            a.title = "comment bulk flag";

            node.appendChild(a);
            commentsDIV = getParent(a, ".post-layout").querySelector(".comments");
            a.href = "#" + commentsDIV.id;

            a.addEventListener("click", function(event){
                toggleBulkFlag(commentsDIV);
            });

            node.classList.add(PROCESSED_CLASS);
        });
    }, 250);
})();
