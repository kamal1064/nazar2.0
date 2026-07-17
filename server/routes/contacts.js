const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const User = require('../models/User');
const { contactValidator, validateObjectId } = require('../middleware/validator');
const { userLimiter } = require('../middleware/rateLimiter');

// POST /api/emergency-contacts - Add a new emergency contact
router.post('/', userLimiter, contactValidator, async (req, res, next) => {
    try {
        const { userId, name, phone, relationship } = req.body;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const contact = new Contact({
            userId,
            name,
            phone,
            relationship
        });

        await contact.save();
        res.status(201).json({ success: true, data: contact });
    } catch (err) {
        next(err);
    }
});

// PUT /api/emergency-contacts/:contactId - Update an existing emergency contact
router.put('/:contactId', userLimiter, async (req, res, next) => {
    try {
        const { contactId } = req.params;
        if (!validateObjectId(contactId)) {
            return res.status(400).json({ success: false, message: 'Invalid Contact ID format' });
        }

        const { name, phone, relationship } = req.body;
        
        const contact = await Contact.findById(contactId);
        if (!contact) {
            return res.status(404).json({ success: false, message: 'Contact not found' });
        }

        if (name !== undefined) contact.name = name;
        if (phone !== undefined) contact.phone = phone;
        if (relationship !== undefined) contact.relationship = relationship;

        await contact.save();
        res.status(200).json({ success: true, data: contact });
    } catch (err) {
        next(err);
    }
});

// GET /api/emergency-contacts/:userId - Retrieve all emergency contacts for a user
router.get('/:userId', userLimiter, async (req, res, next) => {
    try {
        const userId = req.params.userId;
        if (!validateObjectId(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid User ID format' });
        }

        const contacts = await Contact.find({ userId });
        res.status(200).json({ success: true, data: contacts });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/emergency-contacts/:contactId - Delete an emergency contact
router.delete('/:contactId', userLimiter, async (req, res, next) => {
    try {
        const { contactId } = req.params;
        if (!validateObjectId(contactId)) {
            return res.status(400).json({ success: false, message: 'Invalid Contact ID format' });
        }

        const contact = await Contact.findByIdAndDelete(contactId);
        if (!contact) {
            return res.status(404).json({ success: false, message: 'Contact not found' });
        }

        res.status(200).json({ success: true, message: 'Contact deleted successfully' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
