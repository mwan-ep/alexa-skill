/**
 * Copyright © 2018 Elastic Path Software Inc. All rights reserved.
 *
 * This is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this license. If not, see
 *
 *     https://www.gnu.org/licenses/
 *
 *
 */

const Cortex = require('../cortex');
const SpeechAssets = require('../speech/assets');
const { isIntentRequestOfType } = require('../utils');
const { AmazonIntent } = require('../constants');

const ConfirmCheckoutHandler = {
    canHandle({requestEnvelope, attributesManager}) {
        const attributes = attributesManager.getSessionAttributes();
        if (!attributes.confirmCheckout) {
            return false;
        }
        delete attributes.confirmCheckout;
        attributesManager.setSessionAttributes(attributes);
        return isIntentRequestOfType(requestEnvelope, AmazonIntent.YES);
    },
    handle({responseBuilder}) {
        return new Promise((resolve, reject) => {
            Cortex.getCortexInstance()
            .cortexCheckout()
            .then(() => {
                resolve(responseBuilder
                    .speak(SpeechAssets.purchaseSuccess())
                    .reprompt(SpeechAssets.howElseCanIHelp())
                    .getResponse());
            })
            .catch((err) => reject(err));
        });
    }
}

module.exports = ConfirmCheckoutHandler;
