const express    = require('express');
const auth       = require('../../middlewares/auth');
const controller = require('../../controllers/company/ShareController');

const router = express.Router();
const ctrl   = new controller();

router.post('/allotment',          auth(), ctrl.createAllotment);
router.post('/transfer',           auth(), ctrl.createTransfer);
router.post('/transfer/club',      auth(), ctrl.createClubTransfer);
router.post('/retain/club/:id',    auth(), ctrl.retainClubTransfer);
router.post('/retain/:id',         auth(), ctrl.retainShare);
router.post('/dissolve',           auth(), ctrl.createDissolve);
router.post('/retain/dissolve/:id', auth(), ctrl.retainDissolve);
router.post('/retain/buyback/:id',  auth(), ctrl.retainBuyback);
router.post('/cancel',             auth(), ctrl.createCancel);
router.post('/buyback',            auth(), ctrl.createBuyback);
router.post('/replacement',        auth(), ctrl.createReplacement);
router.post('/retain/replacement/:id', auth(), ctrl.retainReplacement);
router.post('/split',              auth(), ctrl.createSplit);
router.post('/retain/split/:id',    auth(), ctrl.retainSplit);
router.post('/combine',            auth(), ctrl.createCombine);
router.post('/retain/combine/:id',  auth(), ctrl.retainCombine);
router.post('/reclassification',   auth(), ctrl.createReclassification);
router.post('/retain/reclassification/:id', auth(), ctrl.retainReclassification);
router.get('/folio/check',         auth(), ctrl.checkFolioNo);
router.get('/replacement/check',   auth(), ctrl.checkReplacementCert);
router.get('/replacement/compatible-certs', auth(), ctrl.listCompatibleReplacementCerts);
router.get('/shareholder-history/:official_entity_id',  auth(), ctrl.shareholderHistory);
router.get('/company-share-summary',                    auth(), ctrl.companyShareSummary);
router.get('/:entity_id/list',                          auth(), ctrl.list);
router.get('/get/:id',             auth(), ctrl.get);
router.delete('/delete/:id',       auth(), ctrl.delete);

module.exports = router;
