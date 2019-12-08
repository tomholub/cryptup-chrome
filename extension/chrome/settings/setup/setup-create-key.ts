/* © 2016-2018 FlowCrypt Limited. Limitations apply. Contact human@flowcrypt.com */

'use strict';

import { SetupView, SetupOptions } from '../setup.js';
import { Ui } from '../../../js/common/browser.js';
import { Catch } from '../../../js/common/platform/catch.js';
import { Settings } from '../../../js/common/settings.js';
import { Xss } from '../../../js/common/platform/xss.js';
import { shouldPassPhraseBeHidden } from '../../../js/common/ui/passphrase_ui.js';
import { Url } from '../../../js/common/core/common.js';
import { Store } from '../../../js/common/platform/store.js';
import { Pgp } from '../../../js/common/core/pgp.js';
import { Lang } from '../../../js/common/lang.js';

declare const openpgp: typeof OpenPGP;

export class SetupCreateKeyModule {

  constructor(private view: SetupView) {
  }

  async actionCreateKeyHandler() {
    await Settings.forbidAndRefreshPageIfCannot('CREATE_KEYS', this.view.rules!);
    if (! await this.isCreatePrivateFormInputCorrect()) {
      return;
    }
    try {
      $('#step_2a_manual_create input').prop('disabled', true);
      Xss.sanitizeRender('#step_2a_manual_create .action_create_private', Ui.spinner('white') + 'just a minute');
      const options: SetupOptions = {
        passphrase: String($('#step_2a_manual_create .input_password').val()),
        passphrase_save: Boolean($('#step_2a_manual_create .input_passphrase_save').prop('checked')),
        submit_main: Boolean($('#step_2a_manual_create .input_submit_key').prop('checked') || this.view.rules!.mustSubmitToAttester()),
        submit_all: Boolean($('#step_2a_manual_create .input_submit_all').prop('checked') || this.view.rules!.mustSubmitToAttester()),
        key_backup_prompt: this.view.rules!.canBackupKeys() ? Date.now() : false,
        recovered: false,
        setup_simple: Boolean($('#step_2a_manual_create .input_backup_inbox').prop('checked')),
        is_newly_created_key: true,
      };
      await this.createSaveKeyPair(options);
      await this.view.preFinalizeSetup(options);
      // only finalize after backup is done. backup.htm will redirect back to this page with ?action=finalize
      window.location.href = Url.create('modules/backup.htm', { action: 'setup', acctEmail: this.view.acctEmail });
    } catch (e) {
      Catch.reportErr(e);
      await Ui.modal.error(`There was an error, please try again.\n\n(${String(e)})`);
      $('#step_2a_manual_create .action_create_private').text('CREATE AND SAVE');
    }
  }

  async actionShowAdvancedSettingsHandle(target: HTMLElement) {
    const advancedCreateSettings = $('#step_2a_manual_create .advanced_create_settings');
    const container = $('#step_2a_manual_create .advanced_create_settings_container');
    if (advancedCreateSettings.is(':visible')) {
      advancedCreateSettings.hide('fast');
      $(target).find('span').text('Show Advanced Settings');
      container.css('width', '360px');
    } else {
      advancedCreateSettings.show('fast');
      $(target).find('span').text('Hide Advanced Settings');
      container.css('width', 'auto');
    }
  }

  private async isCreatePrivateFormInputCorrect() {
    const password1 = $('#step_2a_manual_create .input_password');
    const password2 = $('#step_2a_manual_create .input_password2');
    if (!password1.val()) {
      await Ui.modal.warning('Pass phrase is needed to protect your private email. Please enter a pass phrase.');
      password1.focus();
      return false;
    }
    if ($('#step_2a_manual_create .action_create_private').hasClass('gray')) {
      await Ui.modal.warning('Pass phrase is not strong enough. Please make it stronger, by adding a few words.');
      password1.focus();
      return false;
    }
    if (password1.val() !== password2.val()) {
      await Ui.modal.warning('The pass phrases do not match. Please try again.');
      password2.val('').focus();
      return false;
    }
    let notePp = String(password1.val());
    if (await shouldPassPhraseBeHidden()) {
      notePp = notePp.substring(0, 2) + notePp.substring(2, notePp.length - 2).replace(/[^ ]/g, '*') + notePp.substring(notePp.length - 2, notePp.length);
    }
    const paperPassPhraseStickyNote = `
      <div style="font-size: 1.2em">
        Please write down your pass phrase and store it in safe place or even two.
        It is needed in order to access your FlowCrypt account.
      </div>
      <div class="passphrase-sticky-note">${notePp}</div>
    `;
    return await Ui.modal.confirmWithCheckbox('Yes, I wrote it down', paperPassPhraseStickyNote);
  }

  async createSaveKeyPair(options: SetupOptions) {
    await Settings.forbidAndRefreshPageIfCannot('CREATE_KEYS', this.view.rules!);
    const { full_name } = await Store.getAcct(this.view.acctEmail, ['full_name']);
    try {
      const key = await Pgp.key.create([{ name: full_name || '', email: this.view.acctEmail }], 'rsa4096', options.passphrase); // todo - add all addresses?
      options.is_newly_created_key = true;
      const { keys: [prv] } = await openpgp.key.readArmored(key.private);
      await this.view.saveKeys([prv], options);
    } catch (e) {
      Catch.reportErr(e);
      Xss.sanitizeRender('#step_2_easy_generating, #step_2a_manual_create', Lang.setup.fcDidntSetUpProperly);
    }
  }

}