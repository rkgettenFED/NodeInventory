

var express = require('express');
var app = express();
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var router = express.Router();
var moment = require('moment');
var User = require('../models/users');
var item = require('../models/item');
var profit = require('../models/profit');
var Order = require('../models/orders')
var async = require('async');
var mongoose = require('mongoose');
var moment = require('moment');
var crypto = require('crypto');
var nodemailer = require('nodemailer');
var bcrypt = require('bcrypt');
const io = require('socket.io').listen(4000).sockets;
var Onesignal = require('../config/onesignal');





/* GET users listing. */
router.get('/', function (req, res, next) {
    res.redirect('/users/login');
});
/* FIXME:REWRITE FUNCTION */
router.get('/profit', ensureAuthAdmin, function (req, res) {
    async.series({
        item_total: function (callback) {
            item.aggregate({
                $group: {
                    _id: null,
                    sum: {
                        $sum: "$total"
                    }
                }
            }, callback)
        },
    }, function (err, results) {

        profit.count(function (err, count) {
            var weekly = results.item_total[0].sum;
            var newProfit = new profit({
                week: moment().weeks(),
                date: moment().isoWeekday("Friday"),
                amount: weekly,
            });

            if (!err && count === 0) {

                newProfit.save(function (err) {
                    if (err) {
                        return (err)
                    }
                });

            } else if (!err && count !== 0) {

                newProfit.save(function (err) {
                    if (err) {
                        return next(err)
                    }
                    //Find Latest date then assigns id to dateid
                    var latest = profit.find({}).sort({
                        date: -1
                    }).limit(1).exec(function (err, foo) {
                        var dateid = foo[0]._id;

                        console.log(dateid + " lastest id");
                        //Finds previous document based on the id from dateid
                        profit.find({
                            _id: {
                                $lt: dateid
                            }
                        }).sort({
                            date: -1
                        }).limit(1).exec(function (err, prev) {
                            console.log(prev);
                            //Removes the document from the database if the week is the same
                            if (foo[0].week == prev[0].week) {
                                profit.remove({
                                    _id: foo[0]._id
                                }).exec(function (err) {
                                    if (err) {
                                        return err;
                                    }
                                });
                            } else {
                                return;
                            }

                        })

                    })
                });
            }

        })



        profit.find({}, 'week date amount').exec(function (err, foo) {
            if (err) {
                return next(err);
            }
            res.render('profit', {
                title: 'Profit Table',
                error: err,
                data: results,
                wklySales: foo
            })
        })

        ;

    });
});

router.get('/cleanup', function (req, res, next) {
    res.render('reset', {
        title: 'Cleanup'
    });
})

// Register
router.get('/register', function (req, res) {
    res.render('register');
});

// Login
router.get('/login', function (req, res) {
    //Sunday Login
    if (moment().weekday() == 0) {
        res.redirect('cleanup');
    } else {
        res.render('login', {
            title: 'Login'
        });

    }

});

// Register User
router.post('/register', function (req, res) {

    var hasOwnProperty = Object.prototype.hasOwnProperty;

    function isEmpty(obj) {

        if (obj == null) return true;

        if (obj.length > 0) return false;

        if (obj.length === 0) return true;

        if (typeof obj !== "object") return true;


        for (var key in obj) {
            if (hasOwnProperty.call(obj, key)) return false;
        }

        return true;


    }

    var name = req.body.name;
    var email = req.body.email;
    var username = req.body.username;
    var password = req.body.password;
    var password2 = req.body.confirm_password;
    var admin = req.body.admin;
    var secret = req.body.secret;
    var secretconfirm = "copperexplaintruck";


    // Validation
    req.checkBody('name', 'Name is required').notEmpty();
    req.checkBody('email', 'Email is required').notEmpty();
    //  req.checkBody('userType', 'User Type is Required').notEmpty();
    req.checkBody('email', 'Email is not valid').isEmail();
    req.checkBody('username', 'Username is required').notEmpty();
    req.checkBody('password', 'Password is required').notEmpty();
    req.checkBody('confirm_password', 'Passwords do not match').equals(req.body.password);

    if (admin == "true") {
        console.log('here')
        req.checkBody('secret', 'Secret is empty').notEmpty()
        req.checkBody('secret', 'The secret is incorrect').equals(secretconfirm);
    }


    var errors = req.validationErrors();

    if (errors) {
        res.send(errors)
    } else {
        //Checks if the email thats being added doesn't exist in the database
        User.find({
            email: email
        }).limit(1).exec(function (err, email_exist) {
            if (err) {
                throw err;
            }

            if (isEmpty(email_exist) == false) {

                var user_exists = true;

                let errors = "Email Already Exists";

                res.send(errors)
            } else {
                var newUser = new User({
                    name: name,
                    email: email,
                    username: username,
                    password: password,
                    admin: admin
                });

                User.createUser(newUser, function (err, user) {
                    if (err) throw err;
                    res.send(true);
                });

            }

        })
    }
});

//Passport Strategy
passport.use(new LocalStrategy({
    passReqToCallback:true,
    usernameField: 'email'
    },
    function (req,email,password, done) {
        User.findOne({email:email}, function (err, user) {
            if (err) throw err;
            if (!user) {
                console.log(user);
                return done(null, false,req.flash('no_user','User Doesn\'t Exist'));
            }

            User.comparePassword(password, user.password, function (err, isMatch) {
                if (err) throw err;
                if (isMatch) {
                    return done(null, user);
                } else {
                    return done(null, false,req.flash('credentials','Incorrect password'));
                }
            });

        });
    }));

passport.serializeUser(function (user, done) {
    done(null, user.id);
});

passport.deserializeUser(function (id, done) {
    User.getUserById(id, function (err, user) {
        done(err, user);
    });
});

router.post('/login',
    passport.authenticate('local', {
        //successRedirect: '/inventory',
        failureRedirect: '/users/login',
        failureFlash:true
    }),
    function (req, res) {
        app.set('name', req.body.email);
        User.updateLogin(app.get('name'), function (err, name) {});
        User.getUserByEmail(req.body.email, function (err, user) {
            if (err) throw err;
            if (!user) {
                console.log("not auser");
                return done(null, false, {
                
                    message: 'Unknown User'
                });
            } else if (user.admin === true) {
                res.redirect('/inventory');
            } else {
                res.redirect(
                    'consumer');
            }

        });
    });

router.get('/logout', function (req, res) {
    var name = app.get('name');
    console.log(name);
    req.logout();
    User.updateLogout(name, function (err, name) {
        console.log('log out logged');
    })
    req.flash('success_msg', 'You are logged out');

    res.redirect('/users/login');
});

router.get('/consumer', ensureAuthUser, function (req, res, next) {
    item.find({}, 'name quantity price sold total')
        .exec(function (err, list_items) {
            if (err) {
                return next(err);
            }
            //Successful, so render

            res.render('consumer', {
                title: 'Products',
                item_list: list_items
            });
        });
})

router.get('/cart', ensureAuthUser, function (req, res, next) {
    User.findById({
            _id: req.user._id
        }, 'cart')
        .populate("cart.item")
        .exec(function (err, result) {
            console.log(result)
            let cart_total = 0;
            for (let i = 0; i < result.cart.length; i++) {
                cart_total += result.cart[i].item.price * result.cart[i].quantity;
            }
            if (err) {
                throw err;
            }
            res.render('cart', {
                title: "My Cart",
                cart: result,
                cart_total: cart_total
            })
        })
})
router.post('/cart', ensureAuthUser, function (req, res, next) {
    let id = req.body._id;
    let quantity = req.body.quantity;
    req.checkBody('_id', 'ID is Required').notEmpty();
    req.checkBody('quantity', 'Quantity hasn\'t changed').notEmpty();
    req.checkBody('quantity', 'Must be  a number').isNumeric();
    quantity = parseInt(quantity);
    var errors = req.validationErrors();
    if (errors) {
        User.findById({
                _id: req.user._id
            }, 'cart')
            .populate("cart.item")
            .exec(function (err, result) {
                let cart_total = 0;
                for (let i = 0; i < result.cart.length; i++) {
                    cart_total += result.cart[i].item.price * result.cart[i].quantity;
                }
                if (err) {
                    throw err;
                }
                res.render('cart', {
                    title: "My Cart",
                    cart: result,
                    cart_total: cart_total,
                    errors: errors
                })
            })
    } else {
        User.update({
            _id: req.user._id,
            "cart._id": id
        }, {
            $set: {
                "cart.$.quantity": (quantity) + 1
            }
        }, function (err, result) {
            console.log(result);
            res.redirect('cart')
        });
    }
})

router.post('/cart/delete', ensureAuthUser, function (req, res, next) {
    let id = req.body._id
    req.checkBody('_id', 'ID is Required').notEmpty();
    var errors = req.validationErrors();
    if (errors) {
        res.send("ID is Required");
    } else {
        User.update({
            _id: req.user._id,
            "cart._id": id
        }, {
            $pull: {
                cart: {
                    _id: id
                }
            }
        }, function (err, result) {
            if (err) {
                throw err;
            }
            User.findById({
                    _id: req.user._id
                }, 'cart')
                .populate("cart.item")
                .exec(function (err, result) {
                    let cart_total = 0;
                    for (let i = 0; i < result.cart.length; i++) {
                        cart_total += result.cart[i].item.price * result.cart[i].quantity;
                    }
                    if (err) {
                        res.send("An error");
                    } else {
                        let ajaxupdate = {
                            sucess: true,
                            cart_total: cart_total
                        }
                        res.send(ajaxupdate)
                    }
                })

        });
    }
})

router.post('/addtocart', ensureAuthUser, function (req, res, next) {
    var hasOwnProperty = Object.prototype.hasOwnProperty;

    function isEmpty(obj) {

        if (obj == null) return true;

        if (obj.length > 0) return false;

        if (obj.length === 0) return true;

        if (typeof obj !== "object") return true;


        for (var key in obj) {
            if (hasOwnProperty.call(obj, key)) return false;
        }

        return true;

    }

    let _id = req.body._id;
    let quantity = req.body.quantity
    app.set('quantity', quantity);
    req.checkBody('_id', 'ID is Required').notEmpty();
    req.checkBody('quantity', 'Quantity Should not be empty').notEmpty();
    req.checkBody('quantity', 'Quantity Should be a Number').isNumeric();

    var errors = req.validationErrors();

    if (errors) {
        console.log("errors")
        res.send(errors)
    } else {
        async.waterfall([
            function (callback) {
                item.findById(req.body._id, function addItemToCart(err, found_item) {
                    callback(err, found_item);
                })
            },
            function (found_item, callback) {
                User.findById(req.user._id, function store(err, found_User) {
                    console.log(found_User)
                    User.find({
                            _id: found_User._id
                        })
                        .exec(function (err, cart_exists) {
                            var cart = {
                                item: found_item._id,
                                quantity: quantity
                            }
                            if (err) {
                                throw err;
                            }
                            User.find({
                                _id: req.user._id,
                                "cart.item": cart.item
                            }, function (err, count) {

                                if (!isEmpty(count)) {

                                    User.findOneAndUpdate({
                                        "cart.item": cart.item
                                    }, {
                                        $inc: {
                                            "cart.$.quantity": app.get('quantity')
                                        }
                                    }, function (err, results) {
                                        if (err) {
                                            throw err
                                        }
                                        res.send("This item was already in your cart" + `<br>` + "Quantity has been updated")
                                    })

                                } else {
                                    User.findOneAndUpdate({
                                        _id: req.user._id
                                    }, {
                                        $push: {
                                            cart: cart
                                        }
                                    }, function (err) {
                                        if (err) {
                                            throw err;
                                        }
                                        res.send(true);
                                    })
                                }


                            })

                        })

                })
            }
        ])
    }

})

router.post('/readyorder', ensureAuthAdmin, function (req, res) {
    let id = req.body._id;
    let item_id = req.body.item_id;
    let quantity_purchased = req.body.quantity;
    req.checkBody('_id', 'ID is Required').notEmpty()
    req.checkBody('item_id', 'Item ID is missing').notEmpty()
    req.checkBody('quantity', 'Quantity purchased must not be empty').notEmpty()

    let errors = req.validationErrors();
    if (errors) {
        res.send("ID is Required")
    } else {
        async.waterfall([
            function (callback) {
                async.waterfall([
                    function (callback) {
                        Order.findOne({
                            _id: id
                        }).exec(function (err, order) {
                            callback(err, order)
                        })
                    },
                    function (order, callback) {
                        User.findById({
                                _id: order.user_id
                            })
                            .exec(function (err, found) {
                              
                                var message = {
                                    app_id: "5678a7af-2cd3-4158-9953-360547c5d811",
                                    template_id:"c2dfaa3f-bd5b-43c8-accc-7bea58a4262c",
                                   include_player_ids:[found.onesignal_id]
                                };
                                Onesignal.sendNotification(message); 
                                callback(err,found)
                            })
                    }
                ],function(err,found){
                console.log(err)
                })

                Order.findOneAndUpdate({
                    _id: id
                }, {
                    $set: {
                        "ready": true
                    }
                }, function (err) {
                    if (err) {
                        throw err
                    }
                    let fake = 0;
                    callback(err, fake)
                })
            },
            function (fake, callback) {
                item.findById(item_id, function foundItem(err, product) {
                    try {
                        var updatedProduct = new item({
                            name: product.name,
                            quantity: (product.currentqty - quantity_purchased),
                            price: product.price,
                            _id: product._id,
                            //Parse int to make sure the values are integers.
                            sold: (parseInt(product.currentsold) + parseInt(quantity_purchased)),
                            total: (product.price * quantity_purchased)
                        });

                        item.findByIdAndUpdate(product._id, updatedProduct, function updateItem(err) {
                            if (err) {
                                return next(err);
                            }
                            callback(err, updatedProduct);
                        });
                    } catch (err) {
                        console.log("caught");
                    }


                })
            }

        ], function (err) {
            if (err) {
                res.send("err");
            } else {
                res.send(true);
            }
        })

    }


})

io.on('connection', function (socket) {
    socket.on('ordersubmitted', function () {
        Order.find({}, function (err, result) {
            if (err) {
                throw err;
            }
            let amount_due = 0;
            for (let i = 0; i < result.length; i++) {
                amount_due += result[i].total;
            }

            io.emit('neworder', [result], amount_due)
        })
    })
})


router.post('/addtoorder', ensureAuthUser, function (req, res, next) {
    async.waterfall([
        function (callback) {
            User.findById({
                    _id: req.user._id
                }, 'cart')
                .populate("cart.item")
                .exec(function (err, result) {
                    console.log(result)
                    let cart_total = 0;
                    for (let i = 0; i < result.cart.length; i++) {
                        cart_total = result.cart[i].item.price * result.cart[i].quantity;
                        let order = new Order({
                            item_name: result.cart[i].item.name,
                            quantity_purchased: result.cart[i].quantity,
                            item_price: result.cart[i].item.price,
                            order_date: moment(),
                            total: cart_total,
                            ready: false,
                            user_name: req.user.name,
                            user_id: req.user._id,
                            item_id: result.cart[i].item._id
                        })
                        order.save(function (err) {})
                    }
                    let useless_callback = 0;
                    callback(err, useless_callback);
                })

        },
        function (useless_callback, callback) {

            User.findByIdAndUpdate({
                _id: req.user._id
            }, {
                $set: {
                    cart: []
                }
            }, function (err) {
                if (err) return next(err);
                res.send(true);
            })
        }

    ])
})
router.get('/order', function (req, res, next) {
    Order.find({}, function (err, result) {
        if (err) {
            throw err;
        }
        let amount_due = 0;
        for (let i = 0; i < result.length; i++) {
            amount_due += result[i].total;
        }
        res.render('order', {
            title: 'Order',
            orders: result,
            amount_due: amount_due
        })
    })

})

router.post('/removeorder', function (req, res, next) {
    let id = req.body._id;
    Order.remove({
        _id: id
    }, function orderfound(err, found_order) {
        if (err) {
            res.send(err)
        } else {
            res.send(true)
        }
    })
})
router.get('/order/:id', ensureAuthUser, function (req, res, next) {
    Order.find({
        user_id: req.params.id,
        ready: true
    }, function foundOrders(err, found_orders) {
        if (err) {
            return next(err);
        }
        res.render('completed_orders', {
            title: "Completed Orders",
            completed: found_orders
        })
    })
})

router.get('/forgot', function (req, res) {
    res.render('forgot', {
        user: req.user
    });
});

router.post('/forgot', function (req, res) {
    async.waterfall([
        function (done) {
            crypto.randomBytes(20, function (err, buf) {
                var token = buf.toString('hex');
                done(err, token);
            });
        },
        function (token, done) {
            User.findOne({
                email: req.body.email
            }, function (err, user) {
                if (!user) {
                    req.flash('email_no', '☹️ Cannot find specified Email')
                    return res.redirect('/users/forgot');
                }

                user.resetPasswordToken = token;
                user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

                user.save(function (err) {
                    done(err, token, user);
                });
            });
        },
        function (token, user, done) {
            var smtpTransport = nodemailer.createTransport({
                service: 'SendGrid',
                auth: {
                    user: secret.sendgridusername,
                    pass: secret.sendgridpass
                }
            });
            var mailOptions = {
                to: user.email,
                from: 'chipsinv@cis.net',
                subject: 'Password Reset',
                text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
                    'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                    'http://' + req.headers.host + '/users/r/' + token + '\n\n' +
                    'If you did not request this, please ignore this email and your password will remain unchanged.Link will expire in one hour\n'
            };
            smtpTransport.sendMail(mailOptions, function (err) {
                req.flash('sent', 'An e-mail has been sent to ' + user.email + ' with further instructions.');
                done(err, 'done');
            });
        }
    ], function (err) {
        if (err) return next(err);
        res.redirect('/users/forgot');
    });
})

router.get('/r/:token', function (req, res) {
    User.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: {
            $gt: Date.now()
        }
    }, function (err, user) {
        if (!user) {
            req.flash('invalid_token', '😬 Token is invalid or expired')
            return res.redirect('/users/forgot');
        }
        res.render('resett', {
            user: req.user
        });
    });
});

router.post('/r/:token', function (req, res) {
    async.waterfall([
        function (done) {
            User.findOne({
                resetPasswordToken: req.params.token,
                resetPasswordExpires: {
                    $gt: Date.now()
                }
            }, function (err, user) {
                if (!user) {
                    req.flash('invalid_token', '😬 Token is invalid or expired')
                    return res.redirect('/users/forgot');
                }
                bcrypt.genSalt(10, function (err, salt) {
                    bcrypt.hash(req.body.password, salt, function (err, hash) {
                        user.password = hash;
                        user.resetPasswordToken = undefined;
                        user.resetPasswordExpires = undefined;
                        user.save(function (err) {
                            req.logIn(user, function (err) {
                                done(err, user);
                            });
                        });
                    });
                });





            });
        },
        function (user, done) {
            var smtpTransport = nodemailer.createTransport({
                service: 'SendGrid',
                auth: {
                    user: 'htk_codes',
                    pass: '6siRucJBS2M9'
                }
            });
            var mailOptions = {
                to: user.email,
                from: 'chipsinv@cis.net',
                subject: 'Your password has been changed',
                text: 'Hello,\n\n' +
                    'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
            };
            smtpTransport.sendMail(mailOptions, function (err) {
                console.log("done")
                done(err);
            });
        }
    ], function (err) {
        res.redirect('/inventory');
    });
});



router.get('/changepassword/:id', ensureAuthUser, function (req, res, next) {
    res.render('changepassword');
})
router.post('/changepassword/:id', ensureAuthUser, function (req, res, next) {

    var old = req.body.old;
    let newPassword = req.body.password;
    let newPasswordConfirm = req.body.confirm_password;


    req.checkBody('old', 'Old password is empty').notEmpty();
    req.checkBody('password', 'password is empty').notEmpty();
    req.checkBody('confirm_password', 'Passwords do not match').equals(newPassword);

    let errors = req.validationErrors();

    if (errors) {
        res.render('changepassword', {
            errors: errors
        })
    } else {
        async.waterfall([
            function (callback) {
                User.findById({
                        _id: req.params.id
                    })
                    .exec(function (err, result) {
                        callback(err, result);
                    })
            },
            function (result, callback) {
                User.comparePassword(old, result.password, function (err, isMatch) {
                    if (err) throw err;
                    if (isMatch) {
                        bcrypt.genSalt(10, function (err, salt) {
                            bcrypt.hash(newPassword, salt, function (err, hash) {
                                result.password = hash;
                                result.save(callback);
                                req.flash('passwordchanged', 'Password Successfully Changed');
                                res.render('changepassword');
                            });
                        });
                    } else {

                        req.flash('incorrect', 'Old password is incorrect');
                        res.render('changepassword');
                    }
                });

            }
        ])
    }

})

router.post('/onesignal', function (req, res) {
    let onesignal = req.body.onesignal_id;
    User.findById({
            _id: req.user._id
        })
        .exec(function (err, result) {
            result.onesignal_id = onesignal;
            result.save(function (err) {
                if (err) {
                    res.send(false)
                } else {
                    res.send("done");
                }
            })
        })
})
function ensureAuthAdmin(req, res, next) {
    if (req.isAuthenticated()) {
        User.findById({
            _id: req.user._id
        }, 'admin', function (err, found_user) {
            if (found_user.admin === false) {
                res.redirect('/users/consumer')
            } else {
                return next()
            }
        });
    }
}
function ensureAuthUser(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/users/login');
}


module.exports = router;