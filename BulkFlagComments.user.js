// ==UserScript==
// @name         Bulk flag comments
// @version      0.1
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

    function hasClass(node, className){
        return node.className && new RegExp("(^|\\s)" + className + "(\\s|$)").test(node.className);
    }

    function forEach(nodeList, fn){
        if(!nodeList) return;

        var i = 0, len = nodeList.length;

        for(; i < len; i++){
            fn.call(this, nodeList[i]);
        }
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

    function invokeClick(element){
        var clickEvent = new MouseEvent("click", {
            "view": window,
            "bubbles": true,
            "cancelable": false
        });

        element.dispatchEvent(clickEvent);
    }
    
    function processTokenOnSAPage(){
        var storedToken = GM_getValue(ACCESS_TOKEN),
            postText = $("#answer-7936").querySelector(".post-text"),
            hashTokenMatch = window.location.hash.match(/access_token=(.*?)(&|$)/),
            accessToken = hashTokenMatch && hashTokenMatch[1];
        
        if(!storedToken){
            postText.innerHTML += "<p><b>Please register for an access token at <a href='https://stackoverflow.com/oauth/dialog?client_id=12678&scope=write_access,no_expiry&redirect_uri=stackapps.com/a/7936'>this link.</a></b></p>"
            return;
        }
        
        // user was redirected from the Auth page, update stored token
        if(accessToken) GM_setValue(ACCESS_TOKEN, accessToken);
        
        postText.innerHTML += "<p>Thanks, you successfully registered for an access token!</p>"
    }

    var PROCESSED_CLASS = "cflag-processed",
        CHECKBOX_GROUP = "listFlagged",
        CHECKBOX_WRAPPER_DIV_CLASS = "comment-bulk-flagging",
        BULK_FLAG_OPTIONS_CLASS = "bulk-flag-options",
        ACCESS_TOKEN = "comment-bulk-flag-access-token";

    // reason - "ra" or "nlg"
    function flagBulk(postID, commentIDs, reason){

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

                flagBulk(postID, commentIDsToFlag, flagReason);

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

        function invokeWhenAllCommentsLoaded(){
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

        var clickedShowMoreButton = false,
            checkAllCommentsLoaded = setInterval(function(){
                // expand comment list
                var showMoreLink = commentsDIV.nextElementSibling.querySelector(".js-show-link:not(.dno)");
                if(showMoreLink) {
                    if(!clickedShowMoreButton) {
                        invokeClick(showMoreLink);
                        clickedShowMoreButton = true;
                    }
                }else{
                    clearInterval(checkAllCommentsLoaded);
                    invokeWhenAllCommentsLoaded();
                }
            }, 200);
    }

    function removeBulkFlag(commentsDIV){
        var checkboxDIVs = $("." + CHECKBOX_WRAPPER_DIV_CLASS);
        forEach(checkboxDIVs, function(div){
            div.parentNode.removeChild(div);
        });

        var optionsDIV = $("." + BULK_FLAG_OPTIONS_CLASS);
        optionsDIV.parentNode.removeChild(optionsDIV);

        // unwrap the label
        forEach($("label[for^=\"flag\""), function(label){
            var commentText = label.innerHTML, parent = label.parentNode;
            parent.removeChild(label);
            parent.innerHTML = "<span class=\"comment-copy\">" + commentText + "</span>" + parent.innerHTML;
        });
    }

    // commentsDIV -> generally `.comments`
    function toggleBulkFlag(commentsDIV){
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
    
    if(/stackapps/.test(window.location) && /7935/.test(window.location))
        processTokenOnSAPage();
})();
