const express = require('express');
const passport = require('passport');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

// User registration route
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const user = new User({ username, email, password });
    await user.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error registering user', error });
  }
});

// User login route
router.post('/login', passport.authenticate('local'), (req, res) => {
  res.json({ message: 'User logged in successfully' });
});

// Subscription management route
router.post('/subscribe', async (req, res) => {
  const { userId, paymentMethodId } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const customer = await stripe.customers.create({
      payment_method: paymentMethodId,
      email: user.email,
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ plan: process.env.STRIPE_PLAN_ID }],
      expand: ['latest_invoice.payment_intent'],
    });

    user.subscriptionStatus = 'active';
    await user.save();

    res.json({ message: 'Subscription successful', subscription });
  } catch (error) {
    res.status(500).json({ message: 'Error processing subscription', error });
  }
});

module.exports = router;
