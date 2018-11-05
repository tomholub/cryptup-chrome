/* © 2016-2018 FlowCrypt Limited. Limitations apply. Contact human@flowcrypt.com */

'use strict';

import { Store } from '../../../js/common/store.js';
import { Catch, Env, Dict } from '../../../js/common/common.js';
import { Xss, Ui } from '../../../js/common/browser.js';
import { Pgp } from '../../../js/common/pgp.js';
import { Settings } from '../../../js/common/settings.js';
import { Api } from '../../../js/common/api.js';

declare const openpgp: typeof OpenPGP;

Catch.try(async () => {

  let urlParams = Env.urlParams(['acctEmail', 'embedded', 'parentTabId']);
  let acctEmail = Env.urlParamRequire.string(urlParams, 'acctEmail');
  let parentTabId = Env.urlParamRequire.string(urlParams, 'parentTabId');

  await Ui.passphraseToggle(['passphrase_entry']);

  let [primaryKi] = await Store.keysGet(acctEmail, ['primary']);
  Settings.abortAndRenderErrorIfKeyinfoEmpty(primaryKi, false);
  if (!primaryKi) {
    return; // added do_throw=false above + manually exiting here because security.htm can indeed be commonly rendered on setup page before setting acct up
  }

  let storage = await Store.getAcct(acctEmail, ['hide_message_password', 'outgoing_language']);

  if (urlParams.embedded) {
    $('.change_passhrase_container, .title_container').css('display', 'none');
    $('.line').css('padding', '7px 0');
  }

  let onDefaultExpireUserChange = async () => {
    Xss.sanitizeRender('.select_loader_container', Ui.spinner('green'));
    $('.default_message_expire').css('display', 'none');
    await Api.fc.accountUpdate({ default_message_expire: Number($('.default_message_expire').val()) });
    window.location.reload();
  };

  let onMsgLanguageUserChange = async () => {
    await Store.set(acctEmail, { outgoing_language: $('.password_message_language').val() });
    window.location.reload();
  };

  let storedPassphrase = await Store.passphraseGet(acctEmail, primaryKi.longid, true);
  if (storedPassphrase === null) {
    $('#passphrase_to_open_email').prop('checked', true);
  }
  $('#passphrase_to_open_email').change(Ui.event.handle(() => {
    $('.passhprase_checkbox_container').css('display', 'none');
    $('.passphrase_entry_container').css('display', 'block');
  }));

  $('.action_change_passphrase').click(Ui.event.handle(() => Settings.redirectSubPage(acctEmail, parentTabId, '/chrome/settings/modules/change_passphrase.htm')));

  $('.action_test_passphrase').click(Ui.event.handle(() => Settings.redirectSubPage(acctEmail, parentTabId, '/chrome/settings/modules/test_passphrase.htm')));

  $('.confirm_passphrase_requirement_change').click(Ui.event.handle(async () => {
    if ($('#passphrase_to_open_email').is(':checked')) { // todo - forget pass all phrases, not just master
      let storedPassphrase = await Store.passphraseGet(acctEmail, primaryKi.longid);
      if ($('input#passphrase_entry').val() === storedPassphrase) {
        await Store.passphraseSave('local', acctEmail, primaryKi.longid, undefined);
        await Store.passphraseSave('session', acctEmail, primaryKi.longid, undefined);
        window.location.reload();
      } else {
        alert('Pass phrase did not match, please try again.');
        $('input#passphrase_entry').val('').focus();
      }
    } else { // save pass phrase
      let key = openpgp.key.readArmored(primaryKi.private).keys[0];
      if (await Pgp.key.decrypt(key, [$('input#passphrase_entry').val() as string]) === true) { // text input
        await Store.passphraseSave('local', acctEmail, primaryKi.longid, $('input#passphrase_entry').val() as string);
        window.location.reload();
      } else {
        alert('Pass phrase did not match, please try again.');
        $('input#passphrase_entry').val('').focus();
      }
    }
  }));

  $('.cancel_passphrase_requirement_change').click(() => window.location.reload());

  $('#hide_message_password').prop('checked', storage.hide_message_password === true);
  $('.password_message_language').val(storage.outgoing_language || 'EN');
  $('#hide_message_password').change(Ui.event.handle(async target => {
    await Store.set(acctEmail, { hide_message_password: $(target).is(':checked') });
    window.location.reload();
  }));

  $('.password_message_language').change(Ui.event.handle(onMsgLanguageUserChange));

  let subscription = await Store.subscription();
  if (subscription.active) {
    Xss.sanitizeRender('.select_loader_container', Ui.spinner('green'));
    try {
      let response = await Api.fc.accountUpdate();
      $('.select_loader_container').text('');
      $('.default_message_expire').val(Number(response.result.default_message_expire).toString()).prop('disabled', false).css('display', 'inline-block');
      $('.default_message_expire').change(Ui.event.handle(onDefaultExpireUserChange));
    } catch (e) {
      if (Api.err.isAuthErr(e)) {
        let showAuthErr = () => Settings.redirectSubPage(acctEmail, parentTabId, '/chrome/elements/subscribe.htm', '&source=authErr');
        Xss.sanitizeRender('.expiration_container', '(unknown: <a href="#">verify your device</a>)').find('a').click(Ui.event.handle(showAuthErr));
      } else if (Api.err.isNetErr(e)) {
        Xss.sanitizeRender('.expiration_container', '(network error: <a href="#">retry</a>)').find('a').click(() => window.location.reload()); // safe source
      } else {
        Catch.handleException(e);
        Xss.sanitizeRender('.expiration_container', '(unknown error: <a href="#">retry</a>)').find('a').click(() => window.location.reload()); // safe source
      }
    }
  } else {
    $('.default_message_expire').val('3').css('display', 'inline-block');
    let showSubscribe = () => Settings.redirectSubPage(acctEmail, parentTabId, '/chrome/elements/subscribe.htm');
    Xss.sanitizeAppend($('.default_message_expire').parent(), '<a href="#">upgrade</a>').find('a').click(Ui.event.handle(showSubscribe));
  }

})();