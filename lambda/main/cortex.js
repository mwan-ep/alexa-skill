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

const request = require("request-promise-native");
const Product = require("./parsing/product");

const CORTEX_USER = process.env.CORTEX_USER;
const CORTEX_PASSWORD = process.env.CORTEX_PASSWORD;
const CORTEX_URL = process.env.CORTEX_URL;
const CORTEX_SCOPE = process.env.CORTEX_SCOPE;

let cortex;

function Cortex(baseUrl, scope, token) {
    this.cortexBaseUrl = baseUrl;
    this.scope = scope;
    this.token = token;
}

Cortex.prototype.cortexLogin = function (email, userPassword) {
    return request({
        uri: `${this.cortexBaseUrl}/oauth2/tokens`,
        method: 'POST',
        form: {
            grant_type: 'password',
            scope: this.scope,
            role: 'REGISTERED',
            username: email,
            password: userPassword
        },
        json: true
    });
};

Cortex.prototype.cortexGet = function (url) {
    return request({
        uri: url,
        method: 'GET',
        headers: { 
            Authorization: `bearer ${this.token}`,
            'Content-type': 'application/json'
        },
        timeout: 9000,
        json: true
    });
};

Cortex.prototype.cortexPost = function (url, data) {
    const options = {
        uri: url,
        method: 'POST',
        headers: {
            Authorization: `bearer ${this.token}`,
            'Content-type': 'application/json'
        },
        body: data,
        json: true
    }
    return request(options);
};

Cortex.prototype.cortexPut = function (url, data) {
    return request({
        uri: url,
        method: 'PUT',
        headers: {
            Authorization: `bearer ${this.token}`,
            'Content-type': 'application/json'
        },
        body: data,
        json: true
    });
};

Cortex.prototype.cortexDelete = function (url) {
    return request({
        uri: url,
        method: 'DELETE',
        headers: {
            Authorization: `bearer ${this.token}`,
            'Content-type': 'application/json'
        },
        json: true
    });
};

/**
 * [createCortexInstance - Used to return an authenticated cortex instance.]
 * @param  {[String]} username [the username of EPSHOPPER]
 * @param  {[String]} password [the password of EPSHOPPER]
 * @param  {[String]} baseUrl  [the baseUrl of your Cortex instance ex. http://35.163.108.181:8080/cortex]
 * @param  {[String]} scope    [the scope of EPSHOPPER]
 * @return {[Cortex]}          [authenticated cortex instance]
 */
function createCortexInstance(username, password, baseUrl, scope) {
    return new Promise((resolve, reject) => {
        const cortexInstance = new Cortex(baseUrl, scope);
        cortexInstance.cortexLogin(username, password)
        .then((data) => {
            cortexInstance.token = data.access_token;
            resolve(cortexInstance);
        })
        .catch(error => reject(error));
    });
}

// Temporary Singleton until account linking is done
Cortex.getCortexInstance = function () {
    return new Promise((resolve) => {
        if (!cortex || cortex.token) {
            createCortexInstance(CORTEX_USER, CORTEX_PASSWORD, CORTEX_URL, CORTEX_SCOPE)
            .then((instance) => {
                cortex = instance;
                resolve(cortex);
            })
        } else {
            resolve(cortex)
        }
    });
}

/**
 * function gets item information
 * @param  {String} sku - the sku code of the item you would like to search
 * @param  {String} zoom - The attribute of the item you would like to zoom to.  EX.  can be 'price' or 'definition' or even 'recommendations:crosssell'
 * @return {null}
 */
Cortex.prototype.cortexGetItem = function (sku, zoom) {
    return this.cortexGet(`${this.cortexBaseUrl}?zoom=lookups:itemlookupform:itemlookupaction`)
        .then((data) => {
            let postUrl = `${data._lookups[0]._itemlookupform[0]._itemlookupaction[0].self.href}?followlocation`;
            if (zoom) {
                postUrl = `${postUrl}&zoom=${zoom}`;
            }
            return this.cortexPost(postUrl, { code: sku });
        });
};

/**
 * Adds the selected sku item to the signed in users cart
 * @param  {String} sku      - sku code of desired item to add to cart
 * @param  {Integer} quantity - the amount that should be added to cart
 * @return {[type]}          null
 */
Cortex.prototype.cortexAddToCart = function (sku, itemQuantity) {
    return new Promise((resolve, reject) => {
        this.cortexGetItem(sku, 'addtocartform')
        .then((data) => {
            if (data._addtocartform[0].messages.length === 0) {
                this.cortexPost(data._addtocartform[0].self.href, { quantity: itemQuantity})
                .then(data => resolve(data))
                .catch(error => reject(error));
            } else {
                resolve(data);
            }
        })
        .catch(error => { reject(error) });
    });
};

/**
 * deletes the current item from cart.
 * @param  {String} sku - sku code of the item in the cart that would like to be deleted
 * @return null
 */
Cortex.prototype.cortexDeleteFromCart = function (sku) {
    return new Promise((resolve, reject) => {
        const zoom = [
            'defaultcart:lineitems:element',
            'defaultcart:lineitems:element:item:code'
        ];
        this.cortexGet(`${this.cortexBaseUrl}/?zoom=${zoom.join()}`)
        .then((listOfLineItems) => {
            const elements = listOfLineItems._defaultcart[0]._lineitems[0]._element;
            const promises = [];
            elements.forEach((element) => {
                const code = element._item[0]._code[0].code;
                if (code === sku) {
                    promises.push(this.cortexDelete(element.self.href).then((data) => {
                        resolve(data);
                    }).catch((error) => {
                        reject(error);
                    }));
                }
            });
            Promise.all(promises).then((result) => {
                if (result === undefined || result.length === 0) {
                    reject("Item not found in cart.");
                    
                } else {
                    resolve(result);
                }
            });
        }).catch((error) => {
            reject(error);
        });
    });

};

/**
 * Gets a more detailed results of the item with zoom based on sku. 
* when called will provide the price of the object... NOTE this function is still WIP.  Should return all properties of product
* @param  {String} sku            The sku of a particular product
* @return {Promise} Returns promise, when resolved provides pricing for object
*/
Cortex.prototype.getItemBySku = function (sku) {
    const zoom = [
        'availability',
        'code',
        'definition',
        'definition:components:element',
        'price',
    ];
    return this.cortexGetItem(sku, zoom.join())
        .then(itemData => Product.fromCortexJson(itemData));
}

/**
 * Will query keyword cortex resource
 * @param  {[String]} keyword        - The keyword to be searched
 * @return {[Promise]} - Returns a promise
 */
Cortex.prototype.getItemsByKeyword = function (keyword) {
    return new Promise((resolve, reject) => {
        const zoom = [
            'element:code',
            'element:definition',
            'element:price',
            'element:availability'
        ];
        const url = `${this.cortexBaseUrl}/searches/${this.scope}/keywords/form?followlocation&zoom=${zoom.join()}`;
        this.cortexPost(url, { keywords: keyword })
        .then((data) => {
            const result = [];
            if (data._element && data._element.length > 0) {
                data._element.forEach((itemJson) => {
                    const parsedItem = Product.fromCortexJson(itemJson);
                    if (parsedItem.isAvailable()) {
                        result.push(parsedItem);
                    }
                });
            }
            resolve(result);
        })
        .catch((error) => reject(error));
    });

};

/**
 * Will add a particular item to the wishlist based on sku
 * @param {[type]} sku - the Item sku
 */
Cortex.prototype.cortexAddToWishlist = function (sku) {
    return new Promise((resolve, reject) => {
        this.cortexGetItem(sku, 'addtowishlistform')
        .then((data) => {
            if (data._addtowishlistform) {
                const wishlistActionLink = data._addtowishlistform[0].links[0].href;
                this.cortexPost(wishlistActionLink, {}).then((data) => {
                    resolve(data);
                })
                .catch((error) => reject(error));
            }
        })
        .catch((error) => reject(error));
    });
}

/**
 * Deletes an item from a wishlist based on sku.
 * @param  {String} sku - sku code of the item in the wishlist that would like to be deleted
 * @return null
 */
Cortex.prototype.cortexDeleteFromWishlist = function (sku) {
    return new Promise((resolve, reject) => {
        const zoom = [
            'defaultwishlist:lineitems:element',
            'defaultwishlist:lineitems:element:item:code'
        ];
        this.cortexGet(`${this.cortexBaseUrl}?zoom=${zoom.join()}`)
        .then((data) => {
            const elements = data._defaultwishlist[0]._lineitems[0]._element;
            const promises = [];
            elements.forEach((element) => {
                const code = element._item[0]._code[0].code;
                if (code === sku) {
                    promises.push(this.cortexDelete(element.self.href)
                        .then((data) => resolve(data))
                        .catch((error) => reject(error))
                    );
                }
            });
            Promise.all(promises).then((result) => {
                if (result === undefined || result.length === 0) {
                    reject(result);
                } else {
                    resolve(result);
                }
            });
        })
        .catch((error) => reject(error));
    }); 
};

Cortex.prototype.getWishlistItems = function () {
    return new Promise((resolve, reject) => {
        const zoom = [
            'defaultwishlist:lineitems:element:item:availability',
            'defaultwishlist:lineitems:element:item:code',
            'defaultwishlist:lineitems:element:item:definition',
            'defaultwishlist:lineitems:element:movetocartform:movetocartaction',
            'defaultwishlist:lineitems:element:item:price',
        ];
        this.cortexGet(`${this.cortexBaseUrl}/?zoom=${zoom.join()}`)
        .then((data) => {
            const wishlistItems = []
            if (data._defaultwishlist) {
                const lineItems = data._defaultwishlist[0]._lineitems[0]._element;
                lineItems.forEach((lineitem) => {
                    const item = Product.fromCortexJson(lineitem._item[0]);
                    item.movetocartform = lineitem._movetocartform[0]._movetocartaction[0].self.href;
                    wishlistItems.push(item);
                });
            }
            resolve(wishlistItems);
        })
        .catch((err) => reject(err));
    });
};

Cortex.prototype.getCartItems = function () {
    return new Promise((resolve, reject) => {
        const zoom = [
            'defaultcart:lineitems:element:item:code',
            'defaultcart:lineitems:element:item:definition',
            'defaultcart:lineitems:element:movetowishlistform:movetowishlistaction',
            'defaultcart:lineitems:element:price',
        ];
        this.cortexGet(`${this.cortexBaseUrl}?zoom=${zoom.join()}`)
        .then((data) => resolve(data))
        .catch((error) => reject(error));
    });
}

Cortex.prototype.getTotals = function() {
    return new Promise((resolve, reject) => {
        const zoom = [
            'defaultcart',
            'defaultcart:total'
        ];
        this.cortexGet(`${this.cortexBaseUrl}?zoom=${zoom.join()}`)
        .then((data) => resolve(data))
        .catch((error) => reject(error));
    });
}

Cortex.prototype.cortexCheckout = function () {
    return this.cortexGet(`${this.cortexBaseUrl}?zoom=defaultcart:order:purchaseform`)
        .then((data) => {
            const purchaseForm = data._defaultcart[0]._order[0]._purchaseform[0];
            if (purchaseForm.messages && purchaseForm.messages.length > 0) {
                for (const message of purchaseForm.messages) {
                    if (message.type === "needinfo") {
                        return Promise.reject(message);
                    }
                }
            }
            return this.cortexPost(`${purchaseForm.links[0].href}?followlocation`);
        });
}

module.exports = Cortex;