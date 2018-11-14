/* © 2016-2018 FlowCrypt Limited. Limitations apply. Contact human@flowcrypt.com */

'use strict';

import { Store, Subscription } from '../../js/common/store.js';
import { Att } from '../../js/common/att.js';
import { Xss, Ui, Env } from '../../js/common/browser.js';
import { Composer } from './../../js/common/composer.js';
import { Api } from '../../js/common/api/api.js';
import { BrowserMsg } from '../../js/common/extension.js';
import { Catch } from '../../js/common/catch.js';
import { Dict } from '../../js/common/common.js';
import { Google } from '../../js/common/api/google.js';

Catch.try(async () => {

  Ui.event.protect();

  const urlParams = Env.urlParams(['acctEmail', 'from', 'to', 'subject', 'frameId', 'threadId', 'threadMsgId', 'parentTabId', 'skipClickPrompt', 'ignoreDraft']);
  const acctEmail = Env.urlParamRequire.string(urlParams, 'acctEmail');
  const parentTabId = Env.urlParamRequire.string(urlParams, 'parentTabId');
  const from = Env.urlParamRequire.optionalString(urlParams, 'from') || acctEmail;
  const subject = Env.urlParamRequire.optionalString(urlParams, 'subject') || '';
  const frameId = Env.urlParamRequire.string(urlParams, 'frameId');
  const threadId = Env.urlParamRequire.optionalString(urlParams, 'threadId') || '';
  const to = urlParams.to ? String(urlParams.to).split(',') : [];

  const [primaryKi] = await Store.keysGet(acctEmail, ['primary']);

  const att = Att.keyinfoAsPubkeyAtt(primaryKi);
  let additionalMsgHeaders: Dict<string>;

  const appFunctions = Composer.defaultAppFunctions();
  const tabId = await BrowserMsg.requiredTabId();
  const processedUrlParams = {
    acctEmail, draftId: '', threadId, subject, from, to, frameId, tabId,
    isReplyBox: true, skipClickPrompt: false, // do not skip, would cause errors. This page is using custom template w/o a prompt
    parentTabId, disableDraftSaving: true,
  };
  const composer = new Composer(appFunctions, processedUrlParams, new Subscription(null));

  const sendBtnText = 'Send Response';

  for (const recipient of to) {
    Xss.sanitizeAppend('.recipients', Ui.e('span', { text: recipient }));
  }

  // render
  $('.pubkey_file_name').text(att.name);
  composer.resizeReplyBox();
  BrowserMsg.send.scrollToBottomOfConversation(parentTabId);
  $('#input_text').focus();

  // determine reply headers
  try {
    const thread = await Google.gmail.threadGet(acctEmail, urlParams.threadId as string, 'full');
    if (thread.messages && thread.messages.length > 0) {
      const threadMsgIdLast = Google.gmail.findHeader(thread.messages[thread.messages.length - 1], 'Message-ID') || '';
      const threadMsgRefsLast = Google.gmail.findHeader(thread.messages[thread.messages.length - 1], 'In-Reply-To') || '';
      additionalMsgHeaders = { 'In-Reply-To': threadMsgIdLast, 'References': threadMsgRefsLast + ' ' + threadMsgIdLast };
    }
  } catch (e) {
    if (Api.err.isAuthPopupNeeded(e)) {
      BrowserMsg.send.notificationShowAuthPopupNeeded(parentTabId, { acctEmail });
    } else if (Api.err.isNetErr(e)) {
      // todo - render retry button
    } else {
      Catch.handleErr(e);
      // todo - render error
    }
  }

  $('#send_btn').off().click(Ui.event.prevent('double', async target => {
    $(target).text('sending..');
    const body = { 'text/plain': $('#input_text').get(0).innerText };
    const message = await Api.common.msg(acctEmail, urlParams.from as string, to, urlParams.subject as string, body, [att], urlParams.threadId as string);
    for (const k of Object.keys(additionalMsgHeaders)) {
      message.headers[k] = additionalMsgHeaders[k];
    }
    try {
      await Google.gmail.msgSend(acctEmail, message);
      BrowserMsg.send.notificationShow(parentTabId, { notification: 'Message sent.' });
      Xss.sanitizeReplace('#compose', 'Message sent. The other person should use this information to send a new message.');
    } catch (e) {
      if (Api.err.isAuthPopupNeeded(e)) {
        $(target).text(sendBtnText);
        BrowserMsg.send.notificationShowAuthPopupNeeded(parentTabId, { acctEmail });
        alert('Google account permission needed, please re-connect account and try again.');
      } else if (Api.err.isNetErr(e)) {
        $(target).text(sendBtnText);
        alert('No internet connection, please try again.');
      } else {
        Catch.handleErr(e);
        $(target).text(sendBtnText);
        alert('There was an error sending, please try again.');
      }
    }
  }));

})();
