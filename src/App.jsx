import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  onSnapshot, 
  updateDoc, 
  increment, 
  arrayUnion, 
  arrayRemove,
  serverTimestamp,
  addDoc,
  deleteDoc
} from 'firebase/firestore';
import { 
  Plus, 
  Vote, 
  Image as ImageIcon, 
  Download, 
  Lock, 
  Unlock, 
  ChevronLeft, 
  Trophy, 
  X, 
  Check, 
  Info,
  Palette,
  Upload,
  Camera,
  Clock,
  Calendar,
  User,
  Trash2,
  LayoutGrid,
  List,
  UserCircle,
  Save,
  ShieldAlert,
  Medal,
  Crown,
  Sparkles,
  Maximize2,
  History,
  KeyRound,
  Heart,
  Settings,
  MessageSquare,
  Send,
  LogOut,
  Zap,
  AlertTriangle,
  Copy
} from 'lucide-react';

// --- Firebase Configuration ---
const getFirebaseConfig = () => {
  try {
    if (import.meta && import.meta.env && import.meta.env.VITE_API_KEY) {
      return {
        apiKey: import.meta.env.VITE_API_KEY,
        authDomain: import.meta.env.VITE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_APP_ID,
        measurementId: import.meta.env.VITE_MEASUREMENT_ID
      };
    }
  } catch (e) {}
  if (typeof __firebase_config !== 'undefined') {
    return JSON.parse(__firebase_config);
  }
  return {};
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'astro-arts-challenge';

// Helper to compress and convert image to Base64
const processImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
    };
    reader.onerror = (error) => reject(error);
  });
};

// --- RANK LOGIC ---
const getRank = (totalVotes) => {
  if (totalVotes >= 50) return { title: "Universe Creator", color: "text-fuchsia-400", icon: <Crown size={14} /> };
  if (totalVotes >= 25) return { title: "Galactic Master", color: "text-yellow-400", icon: <Medal size={14} /> };
  if (totalVotes >= 10) return { title: "Nebula Artisan", color: "text-cyan-400", icon: <Sparkles size={14} /> };
  if (totalVotes >= 1) return { title: "Moon Walker", color: "text-emerald-400", icon: <User size={14} /> };
  return { title: "Space Cadet", color: "text-neutral-500", icon: <User size={14} /> };
};

export default function App() {
  const [user, setUser] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [userVoteData, setUserVoteData] = useState({ votedFor: [] });
  const [userProfile, setUserProfile] = useState({ username: '' });
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  
  // Navigation & View State
  const [viewMode, setViewMode] = useState('challenges'); 
  const [fullScreenArtId, setFullScreenArtId] = useState(null); 
  const [dbError, setDbError] = useState(false); 
  const [showRules, setShowRules] = useState(false); 

  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isEditPromptModalOpen, setIsEditPromptModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Forms
  const [promptForm, setPromptForm] = useState({ title: '', imageUrl: '', password: '', deadline: '', maxVotes: 2 });
  const [editPromptForm, setEditPromptForm] = useState({ deadline: '', maxVotes: 2 });
  const [submissionForm, setSubmissionForm] = useState({ title: '', imageUrl: '', passwordAttempt: '' });
  const [tempUsername, setTempUsername] = useState('');
  const [tempSecret, setTempSecret] = useState('');
  const [commentText, setCommentText] = useState(''); 
  
  const [message, setMessage] = useState(null);
  const fileInputRef = useRef(null);

  // --- AUTHENTICATION ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        signInAnonymously(auth).catch((error) => {
            console.warn("Auth warning:", error);
            setMessage({ text: "Login failed. Check connection.", type: 'error' });
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // --- DATA SYNC ---
  useEffect(() => {
    if (!user) return;
    
    // 1. Prompts
    const pRef = collection(db, 'artifacts', appId, 'public', 'data', 'prompts');
    const unsubscribeP = onSnapshot(pRef, (snap) => {
      setPrompts(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setDbError(false);
    }, (error) => {
        if (error.code === 'permission-denied') {
            setDbError(true);
            console.warn("Firestore: Permission denied (Check Database Rules).");
        } else {
            console.error("Prompts sync error:", error);
        }
    });

    // 2. Submissions
    const sRef = collection(db, 'artifacts', appId, 'public', 'data', 'submissions');
    const unsubscribeS = onSnapshot(sRef, (snap) => {
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
        if (error.code === 'permission-denied') {
            setDbError(true);
        } else {
            console.error("Submissions sync error:", error);
        }
    });

    // 3. User Votes (Initial session load)
    const uvRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'votes');
    const unsubscribeV = onSnapshot(uvRef, (docSnap) => {
      if (!userProfile.username && docSnap.exists()) setUserVoteData(docSnap.data());
      else if (!userProfile.username) setUserVoteData({ votedFor: [] });
    }, (error) => {
       if (error.code !== 'permission-denied') console.warn("Guest vote sync warning:", error);
    });

    // 4. User Profile
    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'profile');
    const unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserProfile(data);
        setTempUsername(data.username || '');
      } else {
        setUserProfile({ username: '' });
        setTempUsername('');
      }
      setIsProfileLoading(false);
    }, (error) => {
        console.error("Profile sync error:", error);
    });

    return () => { unsubscribeP(); unsubscribeS(); unsubscribeV(); unsubscribeProfile(); };
  }, [user]);

  // --- VOTE SYNC LOGIC (Switch between Guest vs Registered) ---
  useEffect(() => {
    if (!user) return;

    let unsubscribeVotes;

    if (userProfile.username) {
        // If logged in, listen to GLOBAL Registry votes
        const registryRef = doc(db, 'artifacts', appId, 'public', 'data', 'registry', userProfile.username.toLowerCase());
        unsubscribeVotes = onSnapshot(registryRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserVoteData({ votedFor: data.votedFor || [] });
            } else {
                setUserVoteData({ votedFor: [] });
            }
        }, (error) => {
            if (error.code === 'permission-denied') {
                setDbError(true);
            } else {
                console.error("Registry sync error:", error);
            }
        });
    }

    return () => { if (unsubscribeVotes) unsubscribeVotes(); };
  }, [user, userProfile.username]);


  // Force Profile Modal if no username set
  useEffect(() => {
    if (user && !isProfileLoading && !userProfile.username) {
      setIsProfileModalOpen(true);
    }
  }, [user, isProfileLoading, userProfile.username]);

  const isAdmin = useMemo(() => userProfile.username === 'Tourist', [userProfile.username]);

  const isPromptExpired = useMemo(() => {
    if (!selectedPrompt || !selectedPrompt.deadline) return false;
    return new Date() > new Date(selectedPrompt.deadline);
  }, [selectedPrompt]);

  // --- DATA CLEANUP: Only show submissions connected to valid prompts ---
  const validSubmissions = useMemo(() => {
    const validPromptIds = new Set(prompts.map(p => p.id));
    return submissions.filter(s => validPromptIds.has(s.promptId));
  }, [submissions, prompts]);

  // Real-time Full Screen Art Logic
  const fullScreenArt = useMemo(() => {
    if (!fullScreenArtId) return null;
    if (fullScreenArtId.type === 'prompt') return fullScreenArtId; // Handle prompt preview case
    // Use raw submissions here so deleting logic works even if prompt is gone momentarily
    return submissions.find(s => s.id === fullScreenArtId) || null;
  }, [fullScreenArtId, submissions]);

  // Vote Counting Logic
  const getVotesForPrompt = (promptId) => {
    if (!userVoteData.votedFor) return 0;
    const promptSubmissionIds = validSubmissions
      .filter(s => s.promptId === promptId)
      .map(s => s.id);
    return userVoteData.votedFor.filter(id => promptSubmissionIds.includes(id)).length;
  };

  const currentPromptVotesUsed = useMemo(() => {
    if (!selectedPrompt) return 0;
    return getVotesForPrompt(selectedPrompt.id);
  }, [selectedPrompt, userVoteData, validSubmissions]);

  // Fix: activeVoteCount should only count votes on VALID submissions
  const activeVoteCount = useMemo(() => {
    if (!userVoteData.votedFor) return 0;
    return userVoteData.votedFor.filter(id => validSubmissions.some(s => s.id === id)).length;
  }, [userVoteData, validSubmissions]);

  // Fix: Winner logic uses valid submissions only
  const promptWinner = useMemo(() => {
    if (!selectedPrompt || !isPromptExpired) return null;
    const promptSubs = validSubmissions.filter(s => s.promptId === selectedPrompt.id);
    if (promptSubs.length === 0) return null;
    return [...promptSubs].sort((a, b) => (b.votes || 0) - (a.votes || 0))[0];
  }, [selectedPrompt, validSubmissions, isPromptExpired]);

  // Fix: Banner art is now MOST RECENT valid submission, not global winner
  const bannerArt = useMemo(() => {
    if (validSubmissions.length === 0) return null;
    return [...validSubmissions].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
  }, [validSubmissions]);

  // FILTERED LISTS
  const activePrompts = useMemo(() => {
    return prompts.filter(p => !p.deadline || new Date() <= new Date(p.deadline));
  }, [prompts]);

  const expiredPrompts = useMemo(() => {
    return prompts.filter(p => p.deadline && new Date() > new Date(p.deadline));
  }, [prompts]);

  // Leaderboard uses valid submissions
  const leaderboardData = useMemo(() => {
    const nameStats = {};
    validSubmissions.forEach(sub => {
        const name = sub.artistName || "Anonymous";
        if (name === "Anonymous") return; 
        if (!nameStats[name]) nameStats[name] = { name, totalVotes: 0, entries: 0 };
        nameStats[name].totalVotes += (sub.votes || 0);
        nameStats[name].entries += 1;
    });

    return Object.values(nameStats).sort((a, b) => b.totalVotes - a.totalVotes);
  }, [validSubmissions]);

  const mySubmissions = useMemo(() => {
    if (!user) return [];
    if (userProfile.username) {
        return validSubmissions.filter(s => s.artistName === userProfile.username).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }
    return validSubmissions.filter(s => s.authorId === user.uid).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [validSubmissions, user, userProfile]);

  const myStats = useMemo(() => {
    return mySubmissions.reduce((acc, curr) => ({ totalVotes: acc.totalVotes + (curr.votes || 0) }), { totalVotes: 0 });
  }, [mySubmissions]);

  const handleFileChange = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const base64 = await processImage(file);
      if (type === 'prompt') setPromptForm(prev => ({ ...prev, imageUrl: base64 }));
      else setSubmissionForm(prev => ({ ...prev, imageUrl: base64 }));
    } catch (err) {
      showMessage("Error processing image", "error");
    }
  };

  const handleCreatePrompt = async (e) => {
    e.preventDefault();
    if (!promptForm.imageUrl) return showMessage("Please upload an image", "error");
    if (!promptForm.deadline) return showMessage("Please set a deadline", "error");
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prompts'), {
        ...promptForm, 
        maxVotes: parseInt(promptForm.maxVotes) || 2,
        authorId: user.uid, 
        creatorName: userProfile.username,
        createdAt: serverTimestamp()
      });
      setPromptForm({ title: '', imageUrl: '', password: '', deadline: '', maxVotes: 2 });
      setIsPromptModalOpen(false);
      showMessage("New Prompt Started!", "success");
    } catch (e) { showMessage("Error creating prompt", "error"); }
    setIsSubmitting(false);
  };

  const handleUpdatePrompt = async (e) => {
    e.preventDefault();
    if (!selectedPrompt) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'prompts', selectedPrompt.id), {
        deadline: editPromptForm.deadline,
        maxVotes: parseInt(editPromptForm.maxVotes) || 2
      });
      setIsEditPromptModalOpen(false);
      showMessage("Prompt Updated!", "success");
    } catch (e) {
      console.error(e);
      showMessage("Failed to update prompt.", "error");
    }
    setIsSubmitting(false);
  };

  const openEditModal = (prompt) => {
    setEditPromptForm({
        deadline: prompt.deadline || '',
        maxVotes: prompt.maxVotes || 2
    });
    setIsEditPromptModalOpen(true);
  };

  const handleSubmitArt = async (e) => {
    e.preventDefault();
    if (submissionForm.passwordAttempt !== selectedPrompt.password) return showMessage("Incorrect Password!", "error");
    if (!submissionForm.imageUrl) return showMessage("Please upload your art", "error");
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'submissions'), {
        promptId: selectedPrompt.id, 
        ...submissionForm, 
        artistName: userProfile.username,
        votes: 0, 
        comments: [], 
        authorId: user.uid, 
        createdAt: serverTimestamp()
      });
      setSubmissionForm({ title: '', imageUrl: '', passwordAttempt: '' });
      setIsSubmitModalOpen(false);
      showMessage("Art Submitted!", "success");
    } catch (e) { showMessage("Upload failed", "error"); }
    setIsSubmitting(false);
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!user || !fullScreenArt || !commentText.trim()) return;
    if (!fullScreenArt.id || fullScreenArt.type === 'prompt') return;

    try {
      const artRef = doc(db, 'artifacts', appId, 'public', 'data', 'submissions', fullScreenArt.id);
      const newComment = {
        id: crypto.randomUUID(),
        text: commentText.trim(),
        authorId: user.uid,
        authorName: userProfile.username || "Unknown",
        createdAt: Date.now()
      };
      
      await updateDoc(artRef, {
        comments: arrayUnion(newComment)
      });
      setCommentText("");
    } catch (error) {
      console.error(error);
      showMessage("Failed to post comment", "error");
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!user) return;
    if (userProfile.username) return showMessage("Username is locked.", "error");

    const nameToSave = tempUsername.trim();
    const secretToSave = tempSecret.trim();

    if (!nameToSave) return showMessage("Please enter a username.", "error");
    
    setIsSubmitting(true);
    try {
        const registryRef = doc(db, 'artifacts', appId, 'public', 'data', 'registry', nameToSave.toLowerCase());
        const registrySnap = await getDoc(registryRef);

        let existingVotes = [];

        if (registrySnap.exists()) {
            const data = registrySnap.data();
            if (data.secretPhrase !== secretToSave) {
                setIsSubmitting(false);
                return showMessage("Username taken. Incorrect secret phrase.", "error");
            }
            existingVotes = data.votedFor || [];
        } else {
            if (nameToSave.toLowerCase() === 'tourist' && secretToSave !== 'I am tourist') {
                setIsSubmitting(false);
                return showMessage("You are not the Admin.", "error");
            }
            // Register globally
            await setDoc(registryRef, {
                secretPhrase: secretToSave,
                createdBy: user.uid,
                votedFor: [], 
                createdAt: serverTimestamp()
            });
        }

        const currentGuestVotes = userVoteData.votedFor || [];
        const mergedVotes = [...new Set([...existingVotes, ...currentGuestVotes])];
        
        await setDoc(registryRef, { votedFor: mergedVotes }, { merge: true });

        let finalName = nameToSave;
        if (nameToSave.toLowerCase() === 'tourist') finalName = 'Tourist';

        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'profile'), {
            username: finalName
        }, { merge: true });

        showMessage(finalName === 'Tourist' ? "Welcome, Admin." : "Identity Secured", "success");
        if (!userProfile.username) setIsProfileModalOpen(false);

    } catch (e) {
        console.error(e);
        showMessage("Failed to save profile", "error");
    }
    setIsSubmitting(false);
  };

  const handleLogout = async () => {
    if (userProfile.username && !window.confirm("Disconnect from this username? You will need your Secret Phrase to reclaim it.")) return;
    try {
      await signOut(auth);
      window.location.reload();
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const handleDeleteArt = async (artId) => {
    // SECURITY CHECK: Verify if prompt is expired
    const art = submissions.find(s => s.id === artId);
    if (art) {
        const p = prompts.find(pr => pr.id === art.promptId);
        if (p && p.deadline && new Date() > new Date(p.deadline)) {
            showMessage("Cannot delete archived submissions.", "error");
            return;
        }
    }

    const confirmation = window.prompt("To delete this submission, type 'daddy' below:");
    if (confirmation !== "daddy") {
        if (confirmation !== null) showMessage("Incorrect confirmation.", "error");
        return;
    }

    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'submissions', artId));
      if (fullScreenArtId === artId) setFullScreenArtId(null);
      showMessage("Deleted", "success");
    } catch (error) { showMessage("Failed", "error"); }
  };

  const handleDeletePrompt = async (promptId) => {
    const confirmation = window.prompt("To delete this prompt, type 'daddy' below:");
    if (confirmation !== "daddy") {
        if (confirmation !== null) showMessage("Incorrect confirmation.", "error");
        return;
    }

    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'prompts', promptId));
      setSelectedPrompt(null);
      showMessage("Prompt deleted", "success");
    } catch (error) { showMessage("Failed", "error"); }
  };

  const handleVote = async (artId) => {
    if (!user) return;
    
    const artPiece = submissions.find(s => s.id === artId);
    let limit = 2; 
    let pId = null;

    if (artPiece) {
       pId = artPiece.promptId;
       const artPrompt = prompts.find(p => p.id === artPiece.promptId);
       if (artPrompt) {
           limit = artPrompt.maxVotes || 2;
           if (artPrompt.deadline && new Date() > new Date(artPrompt.deadline)) {
             return showMessage("Voting ended!", "error");
           }
       }
    }

    const isVoted = userVoteData.votedFor.includes(artId);
    const aRef = doc(db, 'artifacts', appId, 'public', 'data', 'submissions', artId);
    
    let userVotesRef;
    if (userProfile.username) {
        userVotesRef = doc(db, 'artifacts', appId, 'public', 'data', 'registry', userProfile.username.toLowerCase());
    } else {
        userVotesRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'votes');
    }

    if (isVoted) {
      await updateDoc(userVotesRef, { votedFor: arrayRemove(artId) });
      await updateDoc(aRef, { votes: increment(-1) });
    } else {
      const currentVotes = getVotesForPrompt(pId);
      if (currentVotes >= limit) return showMessage(`Max ${limit} votes!`, "error");
      
      await setDoc(userVotesRef, { votedFor: arrayUnion(artId) }, { merge: true });
      await updateDoc(aRef, { votes: increment(1) });
    }
  };

  const showMessage = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-purple-500">
      {/* Error Banner */}
      {dbError && (
        <div className="fixed top-0 left-0 right-0 bg-rose-600 text-white p-4 text-center z-[200] flex flex-col items-center gap-2 shadow-2xl">
           <div className="flex items-center gap-2">
             <AlertTriangle size={20} />
             <span className="font-bold">Database Access Denied</span>
           </div>
           <p className="text-sm">You need to update your Firestore Security Rules in the Firebase Console.</p>
           <button 
             onClick={() => setShowRules(!showRules)}
             className="bg-white text-rose-600 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-rose-50 transition-colors mt-2"
           >
             {showRules ? "Hide Rules" : "View Required Rules"}
           </button>
           {showRules && (
             <div className="mt-4 bg-black/50 p-4 rounded-xl w-full max-w-2xl text-left relative">
                <button onClick={() => {
                  const rules = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    function isSignedIn() { return request.auth != null; }\n    match /artifacts/{appId}/public/data/prompts/{document} { allow read: true; allow create: if isSignedIn(); allow update, delete: if isSignedIn(); }\n    match /artifacts/{appId}/public/data/submissions/{document} { allow read: true; allow create: if isSignedIn(); allow update: if isSignedIn(); allow delete: if isSignedIn(); }\n    match /artifacts/{appId}/public/data/registry/{username} { allow read: true; allow write: if isSignedIn(); }\n    match /artifacts/{appId}/users/{userId}/settings/profile { allow read, write: if isSignedIn() && request.auth.uid == userId; }\n    match /artifacts/{appId}/users/{userId}/settings/votes { allow read, write: if isSignedIn() && request.auth.uid == userId; }\n  }\n}`;
                  const textArea = document.createElement("textarea");
                  textArea.value = rules;
                  document.body.appendChild(textArea);
                  textArea.select();
                  try { document.execCommand('copy'); } catch (e) {}
                  document.body.removeChild(textArea);
                }} className="absolute top-2 right-2 text-white/70 hover:text-white"><Copy size={16} /></button>
                <pre className="text-[10px] md:text-xs font-mono text-neutral-300 overflow-x-auto whitespace-pre-wrap">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is signed in
    function isSignedIn() {
      return request.auth != null;
    }

    // 1. PROMPTS (Challenges)
    match /artifacts/{appId}/public/data/prompts/{document} {
      allow read: if true; 
      allow create: if isSignedIn();
      allow update, delete: if isSignedIn();
    }
    
    // 2. SUBMISSIONS (Art)
    match /artifacts/{appId}/public/data/submissions/{document} {
      allow read: if true;
      allow create: if isSignedIn();
      allow update: if isSignedIn();
      allow delete: if isSignedIn();
    }
    
    // 3. GLOBAL REGISTRY (Critical for Usernames)
    match /artifacts/{appId}/public/data/registry/{username} {
      allow read: if true;
      allow write: if isSignedIn();
    }

    // 4. USER SETTINGS
    match /artifacts/{appId}/users/{userId}/settings/profile {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }
    
    match /artifacts/{appId}/users/{userId}/settings/votes {
      allow read, write: if isSignedIn() && request.auth.uid == userId;
    }
  }
}`}
                </pre>
             </div>
           )}
        </div>
      )}

      {/* Banner */}
      <section className="relative h-64 md:h-80 w-full overflow-hidden border-b border-white/5">
        {bannerArt ? (
          <React.Fragment>
            {(() => {
                const p = prompts.find(pr => pr.id === bannerArt.promptId);
                const isExpired = p && p.deadline && new Date() > new Date(p.deadline);
                return (
                    <>
                        <img src={bannerArt.imageUrl} className="w-full h-full object-cover opacity-40 blur-sm scale-110 cursor-pointer" alt="Banner" onClick={() => setFullScreenArtId(bannerArt.id)} />
                        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-transparent to-transparent pointer-events-none" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
                        <div className={`bg-yellow-500 text-black px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2 shadow-lg shadow-yellow-500/20`}>
                            {isExpired ? <><Trophy size={14} /> Featured Art</> : <><Zap size={14} /> Latest Entry</>}
                        </div>
                        <h1 className="text-3xl sm:text-4xl md:text-6xl font-black italic tracking-tighter uppercase drop-shadow-2xl">{String(bannerArt.title)}</h1>
                        <p className="mt-2 text-neutral-400 font-bold uppercase tracking-wider text-xs sm:text-sm">
                            By {isExpired ? (bannerArt.artistName || "Anonymous") : "Anonymous"} • {isExpired ? (Number(bannerArt.votes || 0) + " votes") : "Votes Hidden"}
                        </p>
                        </div>
                    </>
                );
            })()}
          </React.Fragment>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-900/50">
            <Palette className="w-12 h-12 text-neutral-800 mb-4 animate-pulse" />
            <h1 className="text-3xl font-black text-neutral-800 uppercase italic tracking-widest">AstroArts</h1>
          </div>
        )}
      </section>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 -mt-12 relative z-10 pb-20">
        
        {/* Navigation Bar */}
        <div className="flex flex-col gap-4 mb-8 bg-neutral-900/90 backdrop-blur-2xl p-4 sm:p-5 rounded-[2rem] border border-white/5 shadow-2xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            
            {/* View Switcher & Breadcrumbs */}
            <div className="flex items-center gap-4 w-full md:w-auto overflow-x-auto no-scrollbar">
              {selectedPrompt ? (
                <button onClick={() => setSelectedPrompt(null)} className="p-2 hover:bg-white/10 rounded-full text-white transition-colors flex-shrink-0">
                  <ChevronLeft size={24} />
                </button>
              ) : (
                <div className="flex bg-neutral-800 rounded-full p-1 border border-white/5 flex-shrink-0">
                  <button onClick={() => setViewMode('challenges')} className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${viewMode === 'challenges' ? 'bg-white text-black shadow-lg' : 'text-neutral-500 hover:text-white'}`}>
                    <List size={14} /> Prompts
                  </button>
                  <button onClick={() => setViewMode('museum')} className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${viewMode === 'museum' ? 'bg-white text-black shadow-lg' : 'text-neutral-500 hover:text-white'}`}>
                    <History size={14} /> Museum
                  </button>
                  <button onClick={() => setViewMode('leaderboard')} className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${viewMode === 'leaderboard' ? 'bg-white text-black shadow-lg' : 'text-neutral-500 hover:text-white'}`}>
                    <Trophy size={14} /> Rank
                  </button>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              {!selectedPrompt && viewMode === 'challenges' && (
                <button onClick={() => setIsPromptModalOpen(true)} className="flex-1 md:flex-none bg-white text-black px-6 py-3 rounded-full font-black text-xs uppercase hover:bg-purple-400 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-white/10">
                  <Plus size={16} /> New Prompt
                </button>
              )}
              <button onClick={() => setIsProfileModalOpen(true)} className="bg-neutral-800 text-white p-3 rounded-full hover:bg-neutral-700 transition-colors border border-white/10" title="Your Profile">
                <UserCircle size={20} />
              </button>
            </div>
          </div>
          
          {/* Subheader: Active Prompt Stats */}
          {selectedPrompt && (
              <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-2">
                   <h2 className="text-lg sm:text-xl font-bold truncate max-w-[70%]">{selectedPrompt.title}</h2>
                   <div className="flex items-center gap-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                            {currentPromptVotesUsed}/{selectedPrompt.maxVotes || 2} votes used
                        </p>
                        {isAdmin && <span className="bg-rose-600 text-white px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1"><ShieldAlert size={10} /> Admin</span>}
                   </div>
              </div>
          )}
        </div>

        {/* --- LEADERBOARD --- */}
        {viewMode === 'leaderboard' && !selectedPrompt && (
          <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="bg-neutral-900 rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl p-8">
               <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-8 text-center flex items-center justify-center gap-3"><Trophy className="text-yellow-500" /> Leaderboard</h3>
               <div className="space-y-4">
                 {leaderboardData.length === 0 ? <div className="text-center text-neutral-500 py-10 font-bold uppercase tracking-widest text-xs">No Rankings Yet</div> : (
                   leaderboardData.map((data, index) => {
                     const rank = getRank(data.totalVotes);
                     const isTop3 = index < 3;
                     return (
                       <div key={index} className="flex items-center gap-4 bg-neutral-800/50 p-4 rounded-2xl border border-white/5 hover:bg-neutral-800 transition-colors">
                         <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${isTop3 ? 'bg-white text-black' : 'bg-neutral-700 text-neutral-400'}`}>{index + 1}</div>
                         <div className="flex-1">
                           <div className="flex items-center gap-2">
                             <h4 className="font-bold text-lg text-white">{data.name}</h4>
                             <span className={`text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-white/5 flex items-center gap-1 ${rank.color}`}>{rank.icon} {rank.title}</span>
                           </div>
                           <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider">{data.entries} Submissions</p>
                         </div>
                         <div className="text-right">
                           <span className="block text-2xl font-black text-white">{data.totalVotes}</span>
                           <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Votes</span>
                         </div>
                       </div>
                     );
                   })
                 )}
               </div>
             </div>
          </div>
        )}

        {/* --- MUSEUM (PAST CHALLENGES) & ACTIVE CHALLENGES --- */}
        {((viewMode === 'museum' && !selectedPrompt) || (viewMode === 'challenges' && !selectedPrompt)) && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {viewMode === 'museum' ? (
                expiredPrompts.length === 0 ? (
                    <div className="col-span-full py-24 text-center border-2 border-dashed border-white/5 rounded-[3rem] text-neutral-700 font-black uppercase italic tracking-widest text-sm md:text-base">No History Found</div>
                ) : (
                    expiredPrompts.map(p => {
                        const canDelete = isAdmin || (user && user.uid === p.authorId);
                        return (
                            <div key={p.id} onClick={() => setSelectedPrompt(p)} className="group bg-neutral-900 rounded-[2.5rem] border border-white/5 overflow-hidden hover:border-purple-500/50 transition-all cursor-pointer shadow-xl relative opacity-80 hover:opacity-100 grayscale hover:grayscale-0">
                                <div className="aspect-[4/3] relative">
                                    <img src={p.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={p.title} />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                                    <div className="absolute top-4 left-4">
                                        <div className="bg-rose-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg"><Lock size={10} /> Archived</div>
                                    </div>
                                    {canDelete && (
                                        <div className="absolute top-4 right-4 z-20">
                                            <button onClick={(e) => { e.stopPropagation(); handleDeletePrompt(p.id); }} className="bg-neutral-800/80 text-rose-500 p-2 rounded-full hover:bg-rose-500 hover:text-white transition-all border border-rose-500/20 backdrop-blur-sm" title="Delete Prompt"><Trash2 size={16} /></button>
                                        </div>
                                    )}
                                    <div className="absolute bottom-6 left-6 right-6">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[9px] bg-white/20 backdrop-blur-md px-2 py-1 rounded-md uppercase font-black tracking-widest inline-block">Mission Over</span>
                                        </div>
                                        <h3 className="text-xl font-black uppercase italic truncate">{String(p.title)}</h3>
                                        <p className="text-[10px] text-neutral-400 mt-1 flex items-center gap-1 font-mono">Ended on {new Date(p.deadline).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )
            ) : (
              activePrompts.length === 0 ? (
                  <div className="col-span-full py-24 text-center border-2 border-dashed border-white/5 rounded-[3rem] text-neutral-700 font-black uppercase italic tracking-widest text-sm md:text-base">No Active Prompts</div>
              ) : (
                  activePrompts.map(p => {
                    const canDelete = isAdmin || (user && user.uid === p.authorId);
                    return (
                        <div key={p.id} onClick={() => setSelectedPrompt(p)} className="group bg-neutral-900 rounded-[2.5rem] border border-white/5 overflow-hidden hover:border-purple-500/50 transition-all cursor-pointer shadow-xl relative">
                        <div className="aspect-[4/3] relative">
                            <img src={p.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" alt={p.title} />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                            <div className="absolute top-4 left-4">
                                <div className="bg-emerald-500 text-black px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 shadow-lg"><Clock size={10} /> Active</div>
                            </div>
                            {canDelete && (
                            <div className="absolute top-4 right-4 z-20">
                                <button onClick={(e) => { e.stopPropagation(); handleDeletePrompt(p.id); }} className="bg-neutral-800/80 text-rose-500 p-2 rounded-full hover:bg-rose-500 hover:text-white transition-all border border-rose-500/20 backdrop-blur-sm" title="Delete Prompt"><Trash2 size={16} /></button>
                            </div>
                            )}
                            <div className="absolute bottom-6 left-6 right-6">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[9px] bg-purple-600 px-2 py-1 rounded-md uppercase font-black tracking-widest inline-block">Prompt</span>
                                <span className="text-[9px] text-neutral-300 uppercase font-bold tracking-wider">by {p.creatorName || "Unknown"}</span>
                            </div>
                            <h3 className="text-xl font-black uppercase italic truncate">{String(p.title)}</h3>
                            {p.deadline && <p className="text-[10px] text-neutral-400 mt-1 flex items-center gap-1 font-mono">Ends {new Date(p.deadline).toLocaleDateString()}</p>}
                            </div>
                        </div>
                        </div>
                    );
                })
              )
            )}
          </div>
        )}

        {/* --- PROMPT DETAIL VIEW --- */}
        {selectedPrompt && (
          <div className="space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Detail Card */}
            <div className="bg-neutral-900 rounded-[2rem] md:rounded-[3rem] overflow-hidden border border-white/10 flex flex-col md:flex-row shadow-2xl relative">
              {isPromptExpired && <div className="absolute top-0 right-0 left-0 bg-rose-500 text-white text-center py-2 text-[10px] font-black uppercase tracking-[0.2em] z-20">Voting Closed • Winners Revealed</div>}
              <div className="md:w-1/2 aspect-square md:aspect-auto bg-neutral-800 relative group cursor-pointer" onClick={() => setFullScreenArtId({ imageUrl: selectedPrompt.imageUrl, title: selectedPrompt.title, artistName: "Original Prompt", type: 'prompt' })}>
                <img src={selectedPrompt.imageUrl} className="w-full h-full object-contain" alt="Prompt" />
                <div className="absolute bottom-4 right-4 bg-black/60 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-white"><Maximize2 size={20} /></div>
              </div>
              <div className="p-6 md:p-10 md:w-1/2 flex flex-col justify-center bg-gradient-to-br from-neutral-900 to-black">
                <div className="flex items-center gap-2 mb-2">
                   <div className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-neutral-300">Prompt by {selectedPrompt.creatorName || "Unknown"}</div>
                   {(isAdmin || (user && user.uid === selectedPrompt.authorId)) && (
                      <div className="flex gap-2">
                        <button onClick={() => openEditModal(selectedPrompt)} className="bg-white/10 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider hover:bg-white/20 transition-all flex items-center gap-1"><Settings size={12} /> Edit</button>
                        <button onClick={() => handleDeletePrompt(selectedPrompt.id)} className="bg-rose-500/10 text-rose-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider hover:bg-rose-500 hover:text-white transition-all flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                      </div>
                   )}
                </div>
                <h2 className="text-3xl md:text-5xl font-black italic uppercase tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-500">{String(selectedPrompt.title)}</h2>
                <div className="bg-white/5 rounded-2xl p-4 mb-8 border border-white/5 flex flex-wrap gap-4">
                  <div className="flex items-center gap-3 text-sm text-neutral-300 font-medium">
                    <Clock className={isPromptExpired ? "text-rose-500" : "text-emerald-500"} size={18} />
                    {isPromptExpired ? <span className="text-xs md:text-sm">Ended on {new Date(selectedPrompt.deadline).toLocaleString()}</span> : <span className="text-xs md:text-sm">Deadline: {new Date(selectedPrompt.deadline).toLocaleString()}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-neutral-300 font-medium">
                    <Vote className="text-purple-400" size={18} />
                    <span className="text-xs md:text-sm">{currentPromptVotesUsed}/{selectedPrompt.maxVotes || 2} Votes Used</span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <a href={selectedPrompt.imageUrl} download={`AstroPrompt-${selectedPrompt.title}.jpg`} target="_blank" rel="noreferrer" className="flex-1 bg-white text-black py-4 rounded-2xl font-black text-center flex items-center justify-center gap-2 hover:bg-neutral-200 transition-all active:scale-95 text-sm uppercase"><Download size={20} /> Get Prompt</a>
                  {!isPromptExpired ? (
                    <button onClick={() => { setSubmissionForm(prev => ({ ...prev, artistName: userProfile.username || '' })); setIsSubmitModalOpen(true); }} className="flex-1 bg-purple-600 py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-purple-500 transition-all active:scale-95 text-sm uppercase"><Upload size={20} /> Submit Art</button>
                  ) : (
                    <button disabled className="flex-1 bg-neutral-800 text-neutral-500 py-4 rounded-2xl font-black flex items-center justify-center gap-2 cursor-not-allowed text-sm uppercase border border-white/5"><Lock size={20} /> Submission Closed</button>
                  )}
                </div>
              </div>
            </div>

            {/* --- EXPIRED COLLAGE VIEW --- */}
            {isPromptExpired && (
                <div className="animate-in fade-in slide-in-from-bottom-4 delay-150">
                    <div className="flex items-center gap-3 mb-6 pl-2">
                        <LayoutGrid className="text-yellow-500" />
                        <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">Mission Recap</h3>
                    </div>
                    {/* COLLAGE GRID */}
                    <div className="bg-neutral-900/50 p-4 rounded-[2rem] border border-white/10 overflow-hidden">
                        {submissions.filter(s => s.promptId === selectedPrompt.id).length === 0 ? (
                            <div className="text-center py-10 text-neutral-500">No art to show.</div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 auto-rows-[150px] md:auto-rows-[200px]">
                                {submissions.filter(s => s.promptId === selectedPrompt.id)
                                    .sort((a,b) => (b.votes || 0) - (a.votes || 0))
                                    .map((art, index) => {
                                        const isWinner = index === 0;
                                        return (
                                            <div 
                                                key={art.id} 
                                                className={`relative group cursor-pointer overflow-hidden rounded-xl ${isWinner ? 'col-span-2 row-span-2 border-4 border-yellow-500 z-10' : 'col-span-1 row-span-1 border border-white/5'}`}
                                                onClick={() => setFullScreenArtId(art.id)}
                                            >
                                                <img src={art.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={art.title} />
                                                {isWinner && (
                                                    <>
                                                        <div className="absolute top-0 right-0 bg-yellow-500 text-black p-2 rounded-bl-xl shadow-lg z-20">
                                                            <Trophy size={24} />
                                                        </div>
                                                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm p-3 text-center">
                                                            <p className="text-yellow-400 font-black uppercase tracking-widest text-sm truncate">{art.artistName}</p>
                                                            <p className="text-white text-[10px] font-bold">{art.votes} Votes</p>
                                                        </div>
                                                    </>
                                                )}
                                                {!isWinner && (
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <Maximize2 className="text-white drop-shadow-lg" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div>
              <h3 className="text-xl md:text-2xl font-black italic uppercase mb-6 md:mb-8 flex items-center gap-3 pl-2 text-neutral-400"><Palette /> All Submissions</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {submissions.filter(s => s.promptId === selectedPrompt.id).length === 0 ? (
                  <div className="col-span-full py-24 text-center border-2 border-dashed border-white/5 rounded-[3rem] text-neutral-700 font-black uppercase italic tracking-widest text-sm md:text-base">Awaiting First Entry</div>
                ) : (
                  submissions.filter(s => s.promptId === selectedPrompt.id).map(art => {
                    const isVoted = userVoteData.votedFor.includes(art.id);
                    const commentCount = art.comments?.length || 0;
                    return (
                        <div key={art.id} className="group bg-neutral-900 rounded-2xl border border-white/5 overflow-hidden flex flex-col shadow-lg">
                          <div className="relative aspect-square cursor-pointer bg-neutral-800" onClick={() => setFullScreenArtId(art.id)}>
                            <img src={art.imageUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={art.title} />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="bg-black/50 p-1.5 rounded-full text-white backdrop-blur-sm"><Maximize2 size={14} /></div>
                            </div>
                          </div>
                          
                          <div className="p-3">
                              <div className="mb-2">
                                  <h4 className="text-sm font-bold text-white truncate">{art.title}</h4>
                                  <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                                      <User size={10} />
                                      <span className="truncate">{isPromptExpired ? (art.artistName || "Unknown") : "Anonymous"}</span>
                                  </div>
                              </div>
                              <div className="flex items-center justify-end gap-2 mt-3 border-t border-white/5 pt-2">
                                  <div className="flex items-center gap-1 text-xs text-neutral-400">
                                      <MessageSquare size={14} />
                                      <span>{commentCount}</span>
                                  </div>
                                  <button 
                                      onClick={(e) => { e.stopPropagation(); handleVote(art.id); }} 
                                      disabled={isPromptExpired}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isVoted ? 'bg-purple-600 text-white' : 'bg-white/10 text-neutral-300 hover:bg-white/20'}`}
                                  >
                                      <Heart size={14} className={isVoted ? 'fill-current' : ''} />
                                      <span>{art.votes || 0}</span>
                                  </button>
                              </div>
                          </div>
                        </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* --- LIGHTBOX MODAL --- */}
      {fullScreenArt && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
            <div className="absolute top-6 right-6 z-50">
                <button onClick={() => setFullScreenArtId(null)} className="text-white/50 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all"><X size={32} /></button>
            </div>
            
            {/* Image Area */}
            <div className="flex-1 flex items-center justify-center p-0 md:p-10 overflow-hidden" onClick={() => setFullScreenArtId(null)}>
                <img 
                    src={fullScreenArt.imageUrl} 
                    className="max-w-full max-h-full object-contain shadow-2xl transition-transform duration-200" 
                    onClick={(e) => e.stopPropagation()} 
                    alt={fullScreenArt.title}
                />
            </div>

            {/* Footer with Actions */}
            <div className="bg-neutral-900/90 backdrop-blur-md border-t border-white/10 flex flex-col max-h-[40vh]">
                <div className="p-6 border-b border-white/5">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-2xl font-black italic uppercase text-white truncate max-w-[200px] md:max-w-none">{fullScreenArt.title}</h2>
                                <p className="text-neutral-400 font-medium text-sm">
                                    by <span className="text-white">
                                      {(() => {
                                        if (!fullScreenArt.id) return fullScreenArt.artistName || "Original Prompt";
                                        const p = prompts.find(pr => pr.id === fullScreenArt.promptId);
                                        if (p && p.deadline && new Date() > new Date(p.deadline)) return fullScreenArt.artistName || "Anonymous";
                                        return "Anonymous"; // Always anonymous if active
                                      })()}
                                    </span>
                                </p>
                            </div>
                            {fullScreenArt.votes !== undefined && (
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] text-neutral-500 font-black uppercase tracking-widest">Votes</span>
                                    <span className="font-black text-3xl text-white">{fullScreenArt.votes}</span>
                                </div>
                            )}
                        </div>

                        {/* Action Bar */}
                        <div className="flex items-center gap-3">
                            {fullScreenArt.id && !isPromptExpired && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleVote(fullScreenArt.id);
                                    }}
                                    className={`flex-1 py-3 rounded-xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all ${
                                        userVoteData.votedFor.includes(fullScreenArt.id) 
                                        ? 'bg-rose-600 text-white' 
                                        : 'bg-white text-black hover:bg-purple-400'
                                    }`}
                                >
                                    <Heart className={userVoteData.votedFor.includes(fullScreenArt.id) ? 'fill-current' : ''} />
                                    {userVoteData.votedFor.includes(fullScreenArt.id) ? 'Voted' : 'Vote'}
                                </button>
                            )}

                            {(isAdmin || (user && user.uid === fullScreenArt.authorId)) && !isPromptExpired && (
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteArt(fullScreenArt.id);
                                    }}
                                    className="bg-neutral-800 text-rose-500 p-3 rounded-xl hover:bg-rose-500/20 transition-all border border-rose-500/20"
                                >
                                    <Trash2 size={20} />
                                </button>
                            )}
                            
                            {!fullScreenArt.id && (
                                 <a href={fullScreenArt.imageUrl} download className="flex-1 bg-white text-black py-4 rounded-xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                                    <Download size={20} /> Download
                                 </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* Comments Section */}
                {fullScreenArt.id && fullScreenArt.type !== 'prompt' && (
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                      {(!fullScreenArt.comments || fullScreenArt.comments.length === 0) ? (
                        <p className="text-center text-neutral-600 text-xs py-4">No comments yet. Be the first!</p>
                      ) : (
                        fullScreenArt.comments.map(c => {
                          const p = prompts.find(pr => pr.id === fullScreenArt.promptId);
                          const isExpired = p && p.deadline && new Date() > new Date(p.deadline);
                          const displayName = isExpired ? c.authorName : "Anonymous";
                          
                          return (
                            <div key={c.id} className="bg-white/5 p-3 rounded-xl">
                              <div className="flex justify-between items-start mb-1">
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${displayName === "Anonymous" ? "text-neutral-500" : "text-purple-400"}`}>
                                  {displayName}
                                </span>
                                <span className="text-[9px] text-neutral-600">{new Date(c.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                              </div>
                              <p className="text-sm text-neutral-300">{c.text}</p>
                            </div>
                          );
                        })
                      )}
                    </div>
                    {/* Comment Input */}
                    <div className="p-4 border-t border-white/5 bg-black/20">
                      <form onSubmit={handlePostComment} className="flex gap-2">
                        <input 
                          type="text" 
                          value={commentText} 
                          onChange={(e) => setCommentText(e.target.value)} 
                          placeholder="Say something nice..." 
                          className="flex-1 bg-neutral-800 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                        <button type="submit" disabled={!commentText.trim()} className="bg-purple-600 text-white p-2 rounded-full hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed">
                          <Send size={16} />
                        </button>
                      </form>
                    </div>
                  </div>
                )}
            </div>
        </div>
      )}

      {/* Modal Profile */}
      {isProfileModalOpen && (
        <Modal 
          title="Who are you?" 
          onClose={userProfile.username ? () => setIsProfileModalOpen(false) : undefined}
          disableClose={!userProfile.username}
        >
           <div className="space-y-8">
              <div className="bg-neutral-800/50 p-6 rounded-3xl border border-white/5">
                 <div className="flex items-center justify-between mb-4">
                   <h4 className="text-sm font-black uppercase tracking-widest text-neutral-400">{userProfile.username ? "Identity Locked" : "Choose Your Identity"}</h4>
                   {userProfile.username && <div className={`flex items-center gap-1.5 px-3 py-1 bg-black/40 rounded-full border border-white/10 ${getRank(myStats.totalVotes).color}`}>{getRank(myStats.totalVotes).icon}<span className="text-[10px] font-black uppercase tracking-wider">{getRank(myStats.totalVotes).title}</span></div>}
                 </div>
                 
                 <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4 block">Username</label>
                      <input 
                        type="text" 
                        value={tempUsername} 
                        onChange={e => setTempUsername(e.target.value)} 
                        placeholder="SpaceWalker99" 
                        disabled={!!userProfile.username} 
                        className={`w-full bg-neutral-900 border border-white/10 px-6 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold text-white placeholder:text-neutral-600 ${userProfile.username ? 'opacity-50 cursor-not-allowed' : ''}`} 
                      />
                    </div>
                    
                    {!userProfile.username && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4 block flex items-center gap-1"><KeyRound size={10} /> Secret Phrase (Password)</label>
                        <input 
                          type="text" 
                          value={tempSecret} 
                          onChange={e => setTempSecret(e.target.value)} 
                          placeholder="My secret passcode..." 
                          className="w-full bg-neutral-900 border border-white/10 px-6 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold text-white placeholder:text-neutral-600" 
                        />
                        <p className="text-[10px] text-neutral-500 px-2">Used to reclaim your username on other devices.</p>
                      </div>
                    )}

                    {!userProfile.username && (
                      <button type="submit" disabled={isSubmitting} className="bg-purple-600 text-white w-full py-4 rounded-2xl hover:bg-purple-500 transition-colors flex items-center justify-center font-black uppercase tracking-widest text-sm shadow-lg shadow-purple-900/20">
                        {isSubmitting ? "Securing..." : "Establish Identity"}
                      </button>
                    )}
                 </form>

                 {userProfile.username && (
                    <div className="mt-6 pt-4 border-t border-white/5 flex justify-center">
                        <button 
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-rose-500 hover:text-rose-400 text-xs font-black uppercase tracking-widest transition-colors"
                        >
                            <LogOut size={14} /> Log Out
                        </button>
                    </div>
                 )}
              </div>
              {userProfile.username && (
                <div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-neutral-400 mb-4 flex items-center justify-between"><span>My Submissions</span><span className="bg-white/10 px-2 py-1 rounded text-white text-[10px]">{mySubmissions.length} Total</span></h4>
                  <div className="grid grid-cols-2 gap-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                      {mySubmissions.length === 0 ? <div className="col-span-2 py-10 text-center text-neutral-600 text-xs font-bold uppercase tracking-wider">You haven't submitted any art yet.</div> : (
                        mySubmissions.map(art => {
                          const p = prompts.find(p => p.id === art.promptId);
                          const isExpired = p && p.deadline && new Date() > new Date(p.deadline);
                          return (
                            <div key={art.id} className="relative group bg-neutral-800 rounded-2xl overflow-hidden aspect-square border border-white/5" onClick={() => setFullScreenArtId(art.id)}>
                              <img src={art.imageUrl} className="w-full h-full object-cover cursor-pointer" alt={art.title} />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-center p-2 pointer-events-none">
                                  <span className="text-xs font-bold text-white line-clamp-1">{art.title}</span>
                                  <span className="text-[10px] text-neutral-400 mt-1">{art.votes} Votes</span>
                              </div>
                              {!isExpired && <div className="absolute top-2 right-2 z-20"><button onClick={(e) => { e.stopPropagation(); handleDeleteArt(art.id); }} className="bg-rose-500 p-2 rounded-full text-white hover:bg-rose-600"><Trash2 size={12} /></button></div>}
                              <div className={`absolute top-2 left-2 w-2 h-2 rounded-full ${isExpired ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                            </div>
                          )
                        })
                      )}
                  </div>
                </div>
              )}
           </div>
        </Modal>
      )}

      {/* Modal Prompt */}
      {isPromptModalOpen && (
        <Modal title="Start New Prompt" onClose={() => setIsPromptModalOpen(false)}>
          <form onSubmit={handleCreatePrompt} className="space-y-4 md:space-y-6">
            <Input label="Prompt Name" value={promptForm.title} onChange={v => setPromptForm({...promptForm, title: v})} required />
            <div className="space-y-2">
               <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4 block">Deadline</label>
               <input type="datetime-local" value={promptForm.deadline} onChange={e => setPromptForm({...promptForm, deadline: e.target.value})} required className="w-full bg-neutral-800/50 border border-white/5 px-5 py-4 md:px-8 md:py-5 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-bold text-white scheme-dark" />
            </div>
            <div className="space-y-2">
               <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4 block">Max Votes per Person</label>
               <input type="number" min="1" max="10" value={promptForm.maxVotes} onChange={e => setPromptForm({...promptForm, maxVotes: e.target.value})} required className="w-full bg-neutral-800/50 border border-white/5 px-5 py-4 md:px-8 md:py-5 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-bold text-white placeholder:text-neutral-700" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-2">Base Drawing</label>
              <div onClick={() => fileInputRef.current.click()} className="w-full aspect-video bg-neutral-800 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-500/50 transition-all overflow-hidden">
                {promptForm.imageUrl ? <img src={promptForm.imageUrl} className="w-full h-full object-cover" alt="Preview" /> : <><Camera className="text-neutral-600 mb-2" size={32} /><span className="text-xs font-bold text-neutral-500 uppercase">Click to upload image</span></>}
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'prompt')} />
            </div>
            <Input label="Secret Password" type="password" value={promptForm.password} onChange={v => setPromptForm({...promptForm, password: v})} required />
            <button disabled={isSubmitting} className="w-full bg-white text-black py-5 rounded-2xl font-black hover:bg-purple-400 transition-all uppercase italic shadow-xl shadow-white/5">{isSubmitting ? 'Syncing...' : 'Launch Prompt'}</button>
          </form>
        </Modal>
      )}

      {/* Modal Edit Prompt */}
      {isEditPromptModalOpen && (
        <Modal title="Edit Prompt" onClose={() => setIsEditPromptModalOpen(false)}>
          <form onSubmit={handleUpdatePrompt} className="space-y-4 md:space-y-6">
            <div className="space-y-2">
               <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4 block">New Deadline</label>
               <input type="datetime-local" value={editPromptForm.deadline} onChange={e => setEditPromptForm({...editPromptForm, deadline: e.target.value})} required className="w-full bg-neutral-800/50 border border-white/5 px-5 py-4 md:px-8 md:py-5 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-bold text-white scheme-dark" />
            </div>
            <div className="space-y-2">
               <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4 block">Max Votes per Person</label>
               <input type="number" min="1" max="50" value={editPromptForm.maxVotes} onChange={e => setEditPromptForm({...editPromptForm, maxVotes: e.target.value})} required className="w-full bg-neutral-800/50 border border-white/5 px-5 py-4 md:px-8 md:py-5 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-bold text-white" />
            </div>
            <button disabled={isSubmitting} className="w-full bg-white text-black py-5 rounded-2xl font-black hover:bg-purple-400 transition-all uppercase italic shadow-xl shadow-white/5">{isSubmitting ? 'Updating...' : 'Save Changes'}</button>
          </form>
        </Modal>
      )}

      {/* Modal Submit */}
      {isSubmitModalOpen && (
        <Modal title="Publish Masterpiece" onClose={() => setIsSubmitModalOpen(false)}>
          <form onSubmit={handleSubmitArt} className="space-y-6">
            <Input label="Art Title" value={submissionForm.title} onChange={v => setSubmissionForm({...submissionForm, title: v})} required />
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-2">Finished Art</label>
              <div onClick={() => fileInputRef.current.click()} className="w-full aspect-square bg-neutral-800 border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-purple-500/50 transition-all overflow-hidden">
                {submissionForm.imageUrl ? <img src={submissionForm.imageUrl} className="w-full h-full object-cover" alt="Preview" /> : <><Camera className="text-neutral-600 mb-2" size={32} /><span className="text-xs font-bold text-neutral-500 uppercase">Click to upload image</span></>}
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'sub')} />
            </div>
            <div className="relative">
              <Input label="Prompt Password" type="password" value={submissionForm.passwordAttempt} onChange={v => setSubmissionForm({...submissionForm, passwordAttempt: v})} required />
              <div className="absolute right-6 top-12 text-neutral-500">{submissionForm.passwordAttempt === selectedPrompt.password ? <Unlock size={18} className="text-emerald-500" /> : <Lock size={18} />}</div>
            </div>
            <button disabled={isSubmitting} className="w-full bg-purple-600 py-5 rounded-2xl font-black hover:bg-purple-500 transition-all uppercase italic shadow-xl shadow-purple-500/10">{isSubmitting ? 'Uploading...' : 'Confirm Upload'}</button>
          </form>
        </Modal>
      )}

      {message && <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 px-10 py-5 rounded-3xl shadow-2xl z-[100] border font-black uppercase italic text-sm tracking-tighter flex items-center gap-4 animate-in fade-in slide-in-from-bottom-6 ${message.type === 'success' ? 'bg-emerald-500 border-emerald-400' : 'bg-rose-500 border-rose-400'}`}>{message.type === 'success' ? <Check size={20} /> : <Info size={20} />}<span>{String(message.text)}</span></div>}
    </div>
  );
}

function Modal({ title, children, onClose, disableClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in">
      <div className="bg-neutral-900 w-full max-w-lg rounded-[3.5rem] border border-white/10 p-10 shadow-2xl overflow-y-auto max-h-[90vh] relative no-scrollbar">
        {!disableClose && <button onClick={onClose} className="absolute top-10 right-10 text-neutral-500 hover:text-white transition-colors"><X size={28} /></button>}
        <h3 className="text-3xl font-black italic uppercase tracking-tighter mb-10 pr-10">{String(title)}</h3>
        {children}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, required = false }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4 block">{String(label)}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} className="w-full bg-neutral-800/50 border border-white/5 px-8 py-5 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-bold placeholder:text-neutral-700 text-white" />
    </div>
  );
}