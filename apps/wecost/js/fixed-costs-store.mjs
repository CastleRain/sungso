import { db } from './firebase.js';
import { doc, runTransaction, serverTimestamp, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getMember, registerPrivateCleanup } from '../../../shared/firebase/site-auth.mjs';
import { createMemberWork } from '../../../shared/firebase/member-work.mjs';
import { createFixedCostsRepository } from './fixed-costs-repository.mjs';
const work = createMemberWork({ getMember,registerPrivateCleanup });
export const fixedCostsStore = createFixedCostsRepository({ db,doc,runTransaction,serverTimestamp,onSnapshot,work });
