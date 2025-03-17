const express = require('express');
const router = express.Router();
const User = require('../models/user');

// Route to get all users
router.get('/users', async (req, res) => {
    try {
        const users = await User.find();
        res.render('admin', { users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch users',
            error: error.message
        });
    }
});

// Route to add a subscription to a user
router.post('/add-subscription', async (req, res) => {
    const { email, subscriptionStatus } = req.body;

    try {
        const user = await User.findOne({ email: email });

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        user.subscriptionStatus = subscriptionStatus;
        await user.save();

        res.json({
            status: 'success',
            message: 'Subscription status updated successfully'
        });
    } catch (error) {
        console.error('Error updating subscription status:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update subscription status',
            error: error.message
        });
    }
});

module.exports = router;
