const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const createError = require('http-errors')
const Transaction = require("../models/transaction")
const Report = require("../models/report")
const User = require("../models/user")
const fs = require('fs');
const path = require('path');
const Busboy = require('busboy');

const sellerValidation=async (req,res)=>{
    const {transactionId} = req.body
    const trans = await Transaction.findById(transactionId)

    if(trans.sellerCardNum!==req.user.id)
        return res.status(401).send("unauthorized")

    if(!trans){
        return res.status(404).send("transaction not found")
    }
    if(trans.status!=="hold"){
        return res.status(403).send("forbidden")
    }
    await Transaction.findOneAndUpdate({_id : transactionId}, {$set : {status : "sellerConfirmed"}})
    return res.status(200).send("status changed")
}
const buyerValidation=async (req,res)=>{
    const {transactionId} = req.body

    if(trans.buyerCardNum!==req.user.id)
        return res.status(401).send("unauthorized")

    const trans = await Transaction.findById(transactionId)
    if(!trans){
        return res.status(404).send("transaction not found")
    }
    if(trans.status!=="sellerConfirmed"){
        return res.status(403).send("forbidden")
    }
    await Transaction.findOneAndUpdate({_id : transactionId}, {$set : {status : "buyerConfirmed"}})
    return res.status(200).send("status changed")
}
const cancelTransaction=async (req,res)=>{
    const {transactionId} = req.body
    const trans = await Transaction.findById(transactionId)

    if(trans.buyerCardNum!==req.user.id && trans.sellerCardNum!==req.user.id)
        return res.status(401).send("unauthorized")

    if(!trans){
        return res.status(404).send("transaction not found")
    }
    if(trans.status!=="hold"){
        return res.status(403).send("forbidden")
    }
    await Transaction.findOneAndUpdate({_id : transactionId}, {$set : {status : "cancelled"}})
    return res.status(200).send("status changed")


}


const getAllTransactions = async(req,res)=>{
    const CardNum = req.user.id
    const transactions = await Transaction.find({
        $or: [
            { buyerCardNum: CardNum },
            { sellerCardNum: CardNum }
        ]
    });
    res.status(200).send(transactions)
}
const getAllSellerTransactions = async (req,res)=>{
    const {sellerRIP} = req.body
    try{
        const transactions= await Transaction.find({ sellerRIP : sellerRIP })
        res.status(200).send(transactions)

    }catch (e) {
        res.status(500).send("Internal server error : ", e)
    }
}
const getOneTransaction = async (req,res)=>{
    const {id} = req.params
    const trans= await Transaction.findById(id)

    if(trans.buyerCardNum !== req.user.id && trans.sellerCardNum !== req.user.id)
        return res.status(401).send("unauthorized")
    if(!trans){
        return res.status(404).send("transaction not found")
    }
    const seller = await User.findOne({cardNum:trans.sellerCardNum}).select('-password');
    const buyer = await User.findOne({cardNum:trans.buyerCardNum}).select('-password');
    return res.status(200).json({
        transaction: trans,
        seller: seller,
        buyer: buyer
    });
}
const getAllUsers = async (req,res)=>{
    const users = await User.find()
    res.status(200).json(users);
}

const reportIssue = async (req, res) => {
    const busboy = Busboy({ headers: req.headers }); // Correct usage here

    let transactionId = '';
    let sellerRIP = '';
    let message = '';
    let uploadedFilePath = '';

    busboy.on('field', (fieldname, val) => {

        if (fieldname === 'transactionId') {
            transactionId = val;  // Cast to a number
        } else if (fieldname === 'sellerRIP') {
            sellerRIP = Number(val);  // Cast to a number
        } else if (fieldname === 'message') {
            message = val;
        }
    });

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        const saveTo = path.join(__dirname, '../uploads', `${Date.now()}-${filename}.pdf`);
        uploadedFilePath = saveTo;

        file.pipe(fs.createWriteStream(saveTo));
    });

    busboy.on('finish', async () => {
        if (!transactionId || !sellerRIP || !message || !uploadedFilePath) {
            return res.status(400).send('Missing required fields or file');
        }

        try {
            const trans = await Transaction.findById(transactionId);
            if (!trans) {
                return res.status(404).send("Transaction not found");
            }

            if (trans.status !== 'sellerConfirmed') {
                return res.status(403).send("Forbidden: Transaction status is not valid");
            }

            await Transaction.findByIdAndUpdate(transactionId, { status: 'issued' });

            const report = new Report({
                sellerRIP,
                transactionId,
                message,
                filePath: uploadedFilePath,
            });
            await report.save();

            res.status(200).send('Report submitted successfully');
        } catch (error) {
            res.status(500).send("Internal server error: " + error.message);
        }
    });

    req.pipe(busboy);
};


module.exports = {
    getAllUsers,
    sellerValidation,
    buyerValidation,
    cancelTransaction,
    reportIssue,
    getAllTransactions,
    getOneTransaction
};
