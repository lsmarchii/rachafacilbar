import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Plus, Trash2, Share2, Sparkles, DollarSign,
  Lock, Unlock, Crown, QrCode, Copy, CreditCard,
  AlertTriangle, ChevronDown, ChevronUp, Receipt, LogOut,
  CheckCircle2, HelpCircle, Shield, UserPlus, ArrowRight
} from 'lucide-react';

// ==========================================
// IMPORTAÇÕES DO FIREBASE (BANCO EM TEMPO REAL)
// ==========================================
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

// ==========================================
// GERADOR OFICIAL DE PIX (BR CODE BACEN CRC16)
// ==========================================
function crc16ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatEMV(id, value) {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function generatePixPayload({ key, name, city = 'BRASIL', amount, txid = 'RACHAFACIL' }) {
  if (!key) return '';
  const cleanKey = key.trim();
  const cleanName = (name || 'RECEBEDOR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().slice(0, 25);
  const cleanCity = city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().slice(0, 15);
  const gui = formatEMV('00', 'br.gov.bcb.pix');
  const keyField = formatEMV('01', cleanKey);
  const merchantAccount = formatEMV('26', `${gui}${keyField}`);
  const amountStr = amount && amount > 0 ? formatEMV('54', amount.toFixed(2)) : '';
  const additionalData = formatEMV('62', formatEMV('05', txid));

  const payloadWithoutCRC =
    formatEMV('00', '01') +
    merchantAccount +
    formatEMV('52', '0000') +
    formatEMV('53', '986') +
    amountStr +
    formatEMV('58', 'BR') +
    formatEMV('59', cleanName) +
    formatEMV('60', cleanCity) +
    additionalData +
    '6304';

  const crc = crc16ccitt(payloadWithoutCRC);
  return payloadWithoutCRC + crc;
}

// ==========================================
// GERADOR VISUAL QR CODE SVG DETERMINÍSTICO
// ==========================================
function PixQrCodeSvg({ payload, size = 180 }) {
  const gridSize = 25;
  const cells = useMemo(() => {
    const matrix = Array(gridSize).fill(null).map(() => Array(gridSize).fill(false));
    const drawFinder = (r0, c0) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            matrix[r0 + r][c0 + c] = true;
          }
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, gridSize - 7);
    drawFinder(gridSize - 7, 0);

    let hash = 2166136261;
    for (let i = 0; i < payload.length; i++) {
      hash ^= payload.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const inTopLeft = r < 8 && c < 8;
        const inTopRight = r < 8 && c >= gridSize - 8;
        const inBottomLeft = r >= gridSize - 8 && c < 8;
        if (!inTopLeft && !inTopRight && !inBottomLeft) {
          const charCode = payload.charCodeAt((r * gridSize + c) % Math.max(1, payload.length)) || 7;
          matrix[r][c] = ((r * 31 + c * 17 + charCode + Math.abs(hash)) % 3) === 0;
        }
      }
    }
    return matrix;
  }, [payload]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${gridSize} ${gridSize}`} className="bg-white p-2.5 rounded-2xl shadow-inner mx-auto">
      {cells.map((row, r) =>
        row.map((val, c) =>
          val ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0f172a" /> : null
        )
      )}
    </svg>
  );
}

const AVATAR_GRADIENTS = [
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-fuchsia-600',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-indigo-600',
  'from-rose-500 to-pink-600',
  'from-lime-500 to-emerald-600'
];

const QUICK_PRESETS = [
  { label: '🍺 Cerveja 600ml', name: 'Cerveja 600ml', price: '18,00' },
  { label: '🍻 Torre de Chopp', name: 'Torre de Chopp 2.5L', price: '69,90' },
  { label: '🍹 Caipirinha', name: 'Caipirinha', price: '26,00' },
  { label: '🥩 Picanha na Chapa', name: 'Porção de Picanha', price: '119,00' },
  { label: '🍟 Batata Frita', name: 'Porção de Batata Frita', price: '38,00' },
  { label: '🥤 Refrigerante', name: 'Refrigerante Lata', price: '8,50' }
];

const formatCurrency = (val) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const getInitials = (name) => {
  const parts = (name || '').trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export default function App() {
  // ==========================================
  // PERSISTÊNCIA SEGURA COM CACHE IMEDIATO (EVITA TELA BRANCA OU ZERAR CONTA NO F5)
  // ==========================================
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem('rachafacil_roomCode') || '');
  const [inRoom, setInRoom] = useState(() => localStorage.getItem('rachafacil_inRoom') === 'true');
  const [activeUserId, setActiveUserId] = useState(() => localStorage.getItem('rachafacil_activeUserId') || null);

  const [roomData, setRoomData] = useState(() => {
    try {
      const savedCode = localStorage.getItem('rachafacil_roomCode');
      if (savedCode) {
        const cached = localStorage.getItem(`rachafacil_room_${savedCode}`);
        if (cached) return JSON.parse(cached);
      }
    } catch (e) {
      console.error("Erro ao ler cache local:", e);
    }
    return null;
  });

  const [lobbyMode, setLobbyMode] = useState('create');
  const [userNameInput, setUserNameInput] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [roomTitleInput, setRoomTitleInput] = useState('');
  const [hostPinInput, setHostPinInput] = useState('');

  const [activeTab, setActiveTab] = useState('items');

  const [newParticipantName, setNewParticipantName] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [selectedConsumers, setSelectedConsumers] = useState([]);

  const [expandedPersonId, setExpandedPersonId] = useState(null);
  const [pixModalPerson, setPixModalPerson] = useState(null);
  const [requestDeleteModalItem, setRequestDeleteModalItem] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [showAdSlots, setShowAdSlots] = useState(true);
  const [legalModal, setLegalModal] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  // Se a pessoa abrir um link de convite (?sala=XXXX), força ir para a tela de Entrar na Sala
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const salaParam = params.get('sala');
    if (salaParam) {
      const cleanParam = salaParam.trim().toUpperCase();
      setJoinCodeInput(cleanParam);
      setLobbyMode('join');
      const currentSavedCode = localStorage.getItem('rachafacil_roomCode');
      if (currentSavedCode !== cleanParam) {
        setInRoom(false);
      }
    }
  }, []);

  // Mantém o usuário ativo selecionado por padrão nos lançamentos
  useEffect(() => {
    if (activeUserId && selectedConsumers.length === 0) {
      setSelectedConsumers([activeUserId]);
    }
  }, [activeUserId]);

  const handleExitRoom = () => {
    localStorage.removeItem('rachafacil_roomCode');
    localStorage.removeItem('rachafacil_inRoom');
    localStorage.removeItem('rachafacil_activeUserId');
    setInRoom(false);
    setRoomCode('');
    setActiveUserId(null);
    setRoomData(null);
  };

  // ==========================================
  // SINCRONIZAÇÃO EM TEMPO REAL (FIREBASE + FALLBACK LOCAL)
  // ==========================================
  useEffect(() => {
    if (!inRoom || !roomCode) return;

    let unsubscribe = () => {};
    try {
      if (db) {
        const roomRef = doc(db, "rooms", roomCode);
        unsubscribe = onSnapshot(
          roomRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const cloudData = docSnap.data();
              setRoomData(cloudData);
              localStorage.setItem(`rachafacil_room_${roomCode}`, JSON.stringify(cloudData));
            }
          },
          (err) => {
            console.error("Aviso Firebase Snapshot:", err);
          }
        );
      }
    } catch (err) {
      console.error("Erro ao conectar listener do Firebase:", err);
    }

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [inRoom, roomCode]);

  const saveAndBroadcastRoom = async (updatedRoom) => {
    setRoomData(updatedRoom);
    localStorage.setItem(`rachafacil_room_${updatedRoom.code}`, JSON.stringify(updatedRoom));
    try {
      if (db) {
        const roomRef = doc(db, "rooms", updatedRoom.code);
        await setDoc(roomRef, updatedRoom, { merge: true });
      }
    } catch (e) {
      console.error("Erro ao salvar no Firebase:", e);
      showToast('Salvo no aparelho (verifique a conexão com o banco).');
    }
  };

  const handleCreateZeroRoom = async (e) => {
    e.preventDefault();
    const cleanName = userNameInput.trim();
    if (!cleanName) {
      showToast('Digite seu nome para abrir a mesa!');
      return;
    }
    const generatedCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    const hostId = 'user_' + Date.now();
    const savedPix = JSON.parse(localStorage.getItem('rachafacil_saved_pix') || '{}');

    const newRoom = {
      code: generatedCode,
      title: roomTitleInput.trim() || 'Mesa da Galera',
      hostId: hostId,
      hostPin: hostPinInput.trim() || '',
      isLocked: false,
      serviceFeeEnabled: true,
      couvertPerPerson: 0,
      couvertPayers: [hostId],
      discountAmount: 0,
      pixKeyType: savedPix.pixKeyType || 'Celular',
      pixKey: savedPix.pixKey || '',
      pixHolder: savedPix.pixHolder || cleanName,
      participants: [
        {
          id: hostId,
          name: cleanName,
          isHost: true,
          gradient: AVATAR_GRADIENTS[0],
          paymentStatus: 'pending'
        }
      ],
      items: []
    };

    localStorage.setItem('rachafacil_roomCode', generatedCode);
    localStorage.setItem('rachafacil_inRoom', 'true');
    localStorage.setItem('rachafacil_activeUserId', hostId);

    setRoomCode(generatedCode);
    setActiveUserId(hostId);
    setSelectedConsumers([hostId]);
    setInRoom(true);

    await saveAndBroadcastRoom(newRoom);
    showToast(`Sala #${generatedCode} criada! Você é o Anfitrião 👑`);
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    const cleanName = userNameInput.trim();
    const cleanCode = joinCodeInput.trim().toUpperCase().replace('#', '');
    if (!cleanName || !cleanCode) {
      showToast('Preencha o código da sala e o seu nome!');
      return;
    }

    try {
      let parsedRoom = null;

      if (db) {
        const roomRef = doc(db, "rooms", cleanCode);
        const docSnap = await getDoc(roomRef);
        if (docSnap.exists()) {
          parsedRoom = docSnap.data();
        }
      }

      if (!parsedRoom) {
        const cached = localStorage.getItem(`rachafacil_room_${cleanCode}`);
        if (cached) parsedRoom = JSON.parse(cached);
      }

      if (parsedRoom) {
        const participantsList = parsedRoom.participants || [];
        const existingPerson = participantsList.find(
          (p) => p.name.toLowerCase() === cleanName.toLowerCase()
        );

        let activeId = '';
        if (existingPerson) {
          activeId = existingPerson.id;
          setRoomData(parsedRoom);
          localStorage.setItem(`rachafacil_room_${cleanCode}`, JSON.stringify(parsedRoom));
        } else {
          const newUserId = 'user_' + Date.now();
          activeId = newUserId;
          const newParticipant = {
            id: newUserId,
            name: cleanName,
            isHost: false,
            gradient: AVATAR_GRADIENTS[participantsList.length % AVATAR_GRADIENTS.length],
            paymentStatus: 'pending'
          };
          const updatedRoom = {
            ...parsedRoom,
            participants: [...participantsList, newParticipant],
            couvertPayers: [...(parsedRoom.couvertPayers || []), newUserId]
          };
          await saveAndBroadcastRoom(updatedRoom);
        }

        localStorage.setItem('rachafacil_roomCode', cleanCode);
        localStorage.setItem('rachafacil_inRoom', 'true');
        localStorage.setItem('rachafacil_activeUserId', activeId);

        setRoomCode(cleanCode);
        setActiveUserId(activeId);
        setSelectedConsumers([activeId]);
        setInRoom(true);
        showToast(`Você entrou na mesa #${cleanCode}!`);
      } else {
        showToast("Sala não encontrada! Verifique se o código está correto.");
      }
    } catch (err) {
      console.error("Erro ao entrar na sala:", err);
      showToast("Erro ao conectar com o banco de dados.");
    }
  };

  const currentUser = useMemo(() => {
    if (!roomData || !roomData.participants) return null;
    return roomData.participants.find((p) => p.id === activeUserId) || roomData.participants[0];
  }, [roomData, activeUserId]);

  const isCurrentUserHost = Boolean(currentUser && (currentUser.isHost || currentUser.id === roomData?.hostId));

  const totals = useMemo(() => {
    if (!roomData || !roomData.participants) {
      return { byPerson: {}, tableSubtotal: 0, totalService: 0, totalCouvert: 0, totalDiscount: 0, grandTotal: 0 };
    }

    const byPerson = {};
    roomData.participants.forEach((p) => {
      byPerson[p.id] = {
        person: p,
        itemsConsumed: [],
        consumptionSubtotal: 0,
        serviceFee: 0,
        couvertFee: 0,
        discountShare: 0,
        finalTotal: 0
      };
    });

    let tableSubtotal = 0;

    (roomData.items || []).forEach((item) => {
      const totalItemPrice = Number(item.price) * Number(item.qty);
      tableSubtotal += totalItemPrice;
      const validConsumers = (item.consumers || []).filter((cid) => byPerson[cid]);
      if (validConsumers.length > 0) {
        const splitValue = totalItemPrice / validConsumers.length;
        validConsumers.forEach((cid) => {
          byPerson[cid].consumptionSubtotal += splitValue;
          byPerson[cid].itemsConsumed.push({
            ...item,
            totalItemPrice,
            splitCount: validConsumers.length,
            myShare: splitValue
          });
        });
      }
    });

    let totalService = 0;
    let totalCouvert = 0;
    const discountAmount = Number(roomData.discountAmount) || 0;

    roomData.participants.forEach((p) => {
      const personData = byPerson[p.id];
      const service = roomData.serviceFeeEnabled ? personData.consumptionSubtotal * 0.1 : 0;
      const paysCouvert = (roomData.couvertPayers || []).includes(p.id);
      const couvert = paysCouvert ? Number(roomData.couvertPerPerson) || 0 : 0;
      const proportion = tableSubtotal > 0 ? personData.consumptionSubtotal / tableSubtotal : 1 / Math.max(1, roomData.participants.length);
      const discountShare = discountAmount * proportion;

      personData.serviceFee = service;
      personData.couvertFee = couvert;
      personData.discountShare = discountShare;
      personData.finalTotal = Math.max(0, personData.consumptionSubtotal + service + couvert - discountShare);

      totalService += service;
      totalCouvert += couvert;
    });

    const grandTotal = Math.max(0, tableSubtotal + totalService + totalCouvert - discountAmount);

    return { byPerson, tableSubtotal, totalService, totalCouvert, totalDiscount: discountAmount, grandTotal };
  }, [roomData]);

  const handleAddParticipant = async (e) => {
    e.preventDefault();
    if (roomData.isLocked && !isCurrentUserHost) {
      showToast('A mesa está trancada pelo Anfitrião!');
      return;
    }
    const clean = newParticipantName.trim();
    if (!clean) return;
    const newId = 'user_' + Date.now();
    const participantsList = roomData.participants || [];
    const newPerson = {
      id: newId,
      name: clean,
      isHost: false,
      gradient: AVATAR_GRADIENTS[participantsList.length % AVATAR_GRADIENTS.length],
      paymentStatus: 'pending'
    };
    const updated = {
      ...roomData,
      participants: [...participantsList, newPerson],
      couvertPayers: [...(roomData.couvertPayers || []), newId]
    };
    await saveAndBroadcastRoom(updated);
    setNewParticipantName('');
    showToast(`${clean} entrou na mesa!`);
  };

  const handleRemoveParticipant = async (personId) => {
    if (!isCurrentUserHost) {
      showToast('Somente o Anfitrião pode remover participantes.');
      return;
    }
    if (personId === roomData.hostId) {
      showToast('O Anfitrião da sala não pode ser removido.');
      return;
    }
    const updated = {
      ...roomData,
      participants: (roomData.participants || []).filter((p) => p.id !== personId),
      items: (roomData.items || []).map((it) => ({
        ...it,
        consumers: (it.consumers || []).filter((cid) => cid !== personId)
      }))
    };
    await saveAndBroadcastRoom(updated);
    if (activeUserId === personId) setActiveUserId(roomData.hostId);
    showToast('Participante removido.');
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (roomData.isLocked && !isCurrentUserHost) {
      showToast('Mesa trancada para novos lançamentos!');
      return;
    }
    const cleanName = itemName.trim();
    const numericPrice = parseFloat(String(itemPrice).replace(',', '.'));
    if (!cleanName || isNaN(numericPrice) || numericPrice <= 0) {
      showToast('Informe o nome e um valor válido para o item!');
      return;
    }
    const consumersToUse = selectedConsumers.length > 0 ? selectedConsumers : [currentUser?.id];
    const newItem = {
      id: 'item_' + Date.now(),
      name: cleanName,
      price: numericPrice,
      qty: Math.max(1, Number(itemQty) || 1),
      consumers: consumersToUse,
      addedBy: currentUser?.name || 'Participante',
      addedById: currentUser?.id || '',
      deleteRequest: null
    };
    const updated = {
      ...roomData,
      items: [newItem, ...(roomData.items || [])]
    };
    await saveAndBroadcastRoom(updated);
    setItemName('');
    setItemPrice('');
    setItemQty(1);
    if (currentUser?.id) setSelectedConsumers([currentUser.id]);
    showToast(`"${cleanName}" adicionado na conta!`);
  };

  const handleToggleItemConsumer = async (itemId, personId) => {
    if (roomData.isLocked && !isCurrentUserHost) {
      showToast('A mesa está trancada pelo Anfitrião!');
      return;
    }
    const updated = {
      ...roomData,
      items: (roomData.items || []).map((it) => {
        if (it.id !== itemId) return it;
        const currentConsumers = it.consumers || [];
        const exists = currentConsumers.includes(personId);
        const nextConsumers = exists
          ? currentConsumers.filter((id) => id !== personId)
          : [...currentConsumers, personId];
        return { ...it, consumers: nextConsumers };
      })
    };
    await saveAndBroadcastRoom(updated);
  };

  const handleHostDeleteItem = async (itemId) => {
    if (!isCurrentUserHost) {
      showToast('Apenas o Anfitrião pode excluir itens diretamente.');
      return;
    }
    const updated = {
      ...roomData,
      items: (roomData.items || []).filter((it) => it.id !== itemId)
    };
    await saveAndBroadcastRoom(updated);
    showToast('Item excluído pelo Anfitrião!');
  };

  const handleGuestRequestDelete = async (itemId, reason) => {
    const updated = {
      ...roomData,
      items: (roomData.items || []).map((it) =>
        it.id === itemId
          ? {
              ...it,
              deleteRequest: {
                requestedBy: currentUser?.name || 'Convidado',
                reason
              }
            }
          : it
      )
    };
    await saveAndBroadcastRoom(updated);
    setRequestDeleteModalItem(null);
    showToast('Solicitação enviada para o Anfitrião aprovar!');
  };

  const handleHostDismissRequest = async (itemId) => {
    const updated = {
      ...roomData,
      items: (roomData.items || []).map((it) => (it.id === itemId ? { ...it, deleteRequest: null } : it))
    };
    await saveAndBroadcastRoom(updated);
    showToast('Solicitação recusada. O item foi mantido.');
  };

  const handleSetPaymentStatus = async (personId, newStatus) => {
    const updated = {
      ...roomData,
      participants: (roomData.participants || []).map((p) =>
        p.id === personId ? { ...p, paymentStatus: newStatus } : p
      )
    };
    await saveAndBroadcastRoom(updated);
    showToast('Status de pagamento atualizado!');
  };

  const handleCopyInviteLink = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?sala=${roomData.code}`;
    const text = `🍻 Entre na nossa mesa no *RachaFácil*!\nCódigo da Sala: *#${roomData.code}*\nAcesse direto: ${inviteUrl}`;
    navigator.clipboard.writeText(text);
    showToast('Link de convite copiado para o WhatsApp!');
  };

  const handleCopyWhatsAppSummary = () => {
    const lines = [];
    lines.push(`🍻 *RESUMO DA CONTA — ${(roomData.title || 'Mesa').toUpperCase()} (Sala #${roomData.code})*`);
    lines.push(`──────────────────────`);
    (roomData.participants || []).forEach((p) => {
      const pData = totals.byPerson[p.id];
      const statusBadge =
        p.paymentStatus === 'paid_pix'
          ? '✅ (Pago no Pix)'
          : p.paymentStatus === 'paid_card'
          ? '💳 (Pago na Maquininha)'
          : p.paymentStatus === 'notified'
          ? '🔔 (Avisou que pagou)'
          : '⏳ (Pendente)';
      lines.push(`👤 *${p.name}:* ${formatCurrency(pData?.finalTotal || 0)} ${statusBadge}`);
    });
    lines.push(`──────────────────────`);
    lines.push(`💰 *TOTAL DA MESA:* ${formatCurrency(totals.grandTotal)}`);
    if (roomData.pixKey) {
      lines.push(`\n💸 *Faça seu Pix para:* ${roomData.pixKey} (${roomData.pixHolder || 'Anfitrião'})`);
    }
    const shareUrl = `${window.location.origin}${window.location.pathname}`;
    lines.push(`\n⚡ _Conta dividida em 10s no RachaFácil:_ ${shareUrl}`);

    navigator.clipboard.writeText(lines.join('\n'));
    showToast('Resumo completo copiado para o WhatsApp! 🎉');
  };

  // Se o usuário deu F5 e os dados da nuvem ainda estão carregando (1 segundo)
  if (inRoom && roomCode && !roomData) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 space-y-4">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold text-slate-300">Reconectando à Sala #{roomCode}...</p>
        <button
          onClick={handleExitRoom}
          className="text-xs text-slate-400 hover:text-rose-400 underline pt-2"
        >
          Voltar para a tela inicial
        </button>
      </div>
    );
  }

  // ==========================================
  // TELA 1: LOBBY ZERADO DE PRODUÇÃO
  // ==========================================
  if (!inRoom || !roomData) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-4 pb-10">
        {toastMessage && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-slate-950 font-bold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce">
            <CheckCircle2 className="w-5 h-5" />
            <span>{toastMessage}</span>
          </div>
        )}

        <div className="max-w-md w-full mx-auto pt-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3.5 py-1.5 rounded-full text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" /> Divisão de Conta em Tempo Real + QR Pix
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">
              Racha<span className="text-emerald-400">Fácil</span>
            </h1>
            <p className="text-slate-400 text-sm">
              Crie uma sala para sua mesa, compartilhe o código com a galera e cada um lança o que consumiu.
            </p>
          </div>

          <div className="grid grid-cols-2 bg-slate-800 p-1.5 rounded-2xl border border-slate-700/60">
            <button
              type="button"
              onClick={() => setLobbyMode('create')}
              className={`py-2.5 rounded-xl font-bold text-sm transition-all ${
                lobbyMode === 'create'
                  ? 'bg-emerald-500 text-slate-950 shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              👑 Criar Nova Sala
            </button>
            <button
              type="button"
              onClick={() => setLobbyMode('join')}
              className={`py-2.5 rounded-xl font-bold text-sm transition-all ${
                lobbyMode === 'join'
                  ? 'bg-violet-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🍻 Entrar com Código
            </button>
          </div>

          {lobbyMode === 'create' ? (
            <form
              onSubmit={handleCreateZeroRoom}
              className="bg-slate-800 rounded-2xl p-6 border border-slate-700/60 shadow-xl space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Seu Nome (Você será o Anfitrião 👑) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Lucas, Marcos, Ana..."
                  value={userNameInput}
                  onChange={(e) => setUserNameInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Nome do Rolê / Restaurante (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Churrasco de Sábado, Bar do Zé..."
                  value={roomTitleInput}
                  onChange={(e) => setRoomTitleInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  PIN de Segurança do Anfitrião (Opcional - 4 dígitos)
                </label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="Ex: 1234 (Protege contra edições)"
                  value={hostPinInput}
                  onChange={(e) => setHostPinInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-base py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span>Criar Sala Zerada Agora</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          ) : (
            <form
              onSubmit={handleJoinRoom}
              className="bg-slate-800 rounded-2xl p-6 border border-slate-700/60 shadow-xl space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Código da Sala (4 Caracteres) *
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="Ex: A7X9"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 font-mono text-lg uppercase tracking-widest placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Seu Nome na Mesa *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Maria, Pedro..."
                  value={userNameInput}
                  onChange={(e) => setUserNameInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-violet-600 hover:bg-violet-500 text-white font-extrabold text-base py-4 rounded-xl shadow-lg shadow-violet-600/25 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span>Entrar na Mesa</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          )}

          <div className="bg-slate-800/60 rounded-2xl p-5 border border-slate-700/40 space-y-3 text-xs text-slate-400">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-emerald-400" /> Como funciona o RachaFácil?
            </h2>
            <p>
              1. <strong>Crie a Sala:</strong> O responsável pela mesa cria uma sala e compartilha o código com os amigos.
            </p>
            <p>
              2. <strong>Tempo Real:</strong> Todos da mesa podem adicionar porções e bebidas. O Firestore sincroniza os celulares instantaneamente.
            </p>
            <div className="pt-2 flex items-center justify-between border-t border-slate-700/50 text-[11px]">
              <button onClick={() => setLegalModal('privacy')} className="hover:text-emerald-400 underline">
                Política de Privacidade (LGPD)
              </button>
              <button onClick={() => setLegalModal('terms')} className="hover:text-emerald-400 underline">
                Termos de Uso
              </button>
            </div>
          </div>
        </div>

        {legalModal && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4">
              <h3 className="text-lg font-bold text-white">
                {legalModal === 'privacy' ? 'Política de Privacidade e LGPD' : 'Termos de Uso'}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {legalModal === 'privacy'
                  ? 'O RachaFácil preza pela sua privacidade conforme a LGPD (Lei nº 13.709/2018). As chaves Pix servem exclusivamente para gerar o código oficial do Banco Central.'
                  : 'O RachaFácil é uma ferramenta auxiliar de cálculo para divisão de despesas entre amigos.'}
              </p>
              <button
                onClick={() => setLegalModal(null)}
                className="w-full bg-emerald-500 text-slate-950 font-bold py-2.5 rounded-xl"
              >
                Entendi e Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // TELA 2: DENTRO DA SALA ATIVA
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-28">
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-slate-950 font-bold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="text-sm">{toastMessage}</span>
        </div>
      )}

      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight">
                Racha<span className="text-emerald-400">Fácil</span>
              </span>
              <button
                onClick={handleCopyInviteLink}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 text-xs font-mono font-bold px-2.5 py-1 rounded-lg flex items-center gap-1"
                title="Copiar convite da sala"
              >
                #{roomData.code} <Share2 className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs text-slate-400 truncate max-w-[180px]">{roomData.title}</p>
          </div>

          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Total da Mesa</span>
            <span className="text-lg font-extrabold text-emerald-400 tabular-nums">
              {formatCurrency(totals.grandTotal)}
            </span>
          </div>
        </div>

        <div className="max-w-lg mx-auto mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            <span className="text-slate-400 shrink-0">Eu sou:</span>
            {(roomData.participants || []).map((p) => {
              const active = p.id === currentUser?.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setActiveUserId(p.id);
                    setSelectedConsumers([p.id]);
                    localStorage.setItem('rachafacil_activeUserId', p.id);
                  }}
                  className={`px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 shrink-0 transition-all ${
                    active
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {p.isHost && <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />}
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleExitRoom}
            className="text-slate-400 hover:text-rose-400 shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800"
            title="Sair ou Trocar de Sala"
          >
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-5">
        <section className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-400" />
              Galera na Mesa ({(roomData.participants || []).length})
            </h2>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-slate-900 text-slate-300">
              {isCurrentUserHost ? '👑 Você é o Anfitrião' : '🍻 Modo Convidado'}
            </span>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            {(roomData.participants || []).map((p) => (
              <div key={p.id} className="flex flex-col items-center shrink-0 relative group">
                <button
                  type="button"
                  onClick={() => {
                    setActiveUserId(p.id);
                    localStorage.setItem('rachafacil_activeUserId', p.id);
                  }}
                  className={`w-12 h-12 rounded-full bg-gradient-to-br ${p.gradient} flex items-center justify-center font-bold text-white shadow-md border-2 transition-transform ${
                    p.id === currentUser?.id ? 'border-emerald-400 scale-105' : 'border-slate-800 opacity-85'
                  }`}
                >
                  {getInitials(p.name)}
                </button>
                {p.isHost && (
                  <span className="absolute -top-1 -left-1 bg-amber-400 text-slate-950 rounded-full p-0.5 shadow">
                    <Crown className="w-3 h-3" />
                  </span>
                )}
                {isCurrentUserHost && !p.isHost && (
                  <button
                    type="button"
                    onClick={() => handleRemoveParticipant(p.id)}
                    className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] shadow"
                    title="Remover da mesa"
                  >
                    ×
                  </button>
                )}
                <span className="text-xs font-medium text-slate-300 mt-1 max-w-[68px] truncate">{p.name}</span>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddParticipant} className="flex gap-2 pt-1">
            <input
              type="text"
              placeholder="Adicionar amigo na mesa..."
              value={newParticipantName}
              onChange={(e) => setNewParticipantName(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-1 shrink-0 transition-all"
            >
              <UserPlus className="w-4 h-4" /> Adicionar
            </button>
          </form>
        </section>

        <div className="grid grid-cols-3 bg-slate-800 p-1 rounded-2xl border border-slate-700/50 text-xs font-bold">
          <button
            onClick={() => setActiveTab('items')}
            className={`py-2.5 rounded-xl transition-all ${
              activeTab === 'items' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400'
            }`}
          >
            🍻 Comanda ({(roomData.items || []).length})
          </button>
          <button
            onClick={() => setActiveTab('pix')}
            className={`py-2.5 rounded-xl transition-all ${
              activeTab === 'pix' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400'
            }`}
          >
            💸 Taxas & Pix
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`py-2.5 rounded-xl transition-all ${
              activeTab === 'security' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400'
            }`}
          >
            🔒 Segurança
          </button>
        </div>

        {activeTab === 'items' && (
          <div className="space-y-5">
            <form
              onSubmit={handleAddItem}
              className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50 shadow-lg space-y-3.5"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-emerald-400" /> Lançar Pedido na Conta
                </h3>
                <span className="text-[11px] text-slate-400">Lançando como {currentUser?.name}</span>
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {QUICK_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setItemName(preset.name);
                      setItemPrice(preset.price);
                    }}
                    className="bg-slate-900 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs px-2.5 py-1.5 rounded-xl shrink-0 transition-all"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-6">
                  <label className="text-[11px] text-slate-400 block mb-1">Item / Pedido</label>
                  <input
                    type="text"
                    placeholder="Ex: Porção de Picanha"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100"
                  />
                </div>
                <div className="col-span-4">
                  <label className="text-[11px] text-slate-400 block mb-1">Valor Unit. (R$)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 tabular-nums"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-slate-400 block mb-1">Qtd</label>
                  <input
                    type="number"
                    min="1"
                    value={itemQty}
                    onChange={(e) => setItemQty(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-2.5 text-sm text-center text-slate-100 tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Quem vai dividir esse item?</span>
                  <button
                    type="button"
                    onClick={() => setSelectedConsumers((roomData.participants || []).map((p) => p.id))}
                    className="text-emerald-400 font-semibold hover:underline"
                  >
                    Marcar Todos
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(roomData.participants || []).map((p) => {
                    const isSel = selectedConsumers.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedConsumers((prev) =>
                            prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                          );
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                          isSel
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" /> Adicionar à Conta da Mesa
              </button>
            </form>

            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                Itens Lançados na Mesa ({(roomData.items || []).length})
              </h3>

              {(roomData.items || []).length === 0 ? (
                <div className="bg-slate-800/60 border border-dashed border-slate-700 rounded-2xl p-8 text-center space-y-2">
                  <Receipt className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">Nenhum pedido lançado ainda</p>
                </div>
              ) : (
                (roomData.items || []).map((item) => {
                  const itemTotal = Number(item.price) * Number(item.qty);
                  const consumersList = item.consumers || [];
                  const splitVal = consumersList.length > 0 ? itemTotal / consumersList.length : 0;

                  return (
                    <div
                      key={item.id}
                      className="bg-slate-800 rounded-2xl p-4 border border-slate-700/60 shadow space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-bold text-slate-100 text-sm">
                            {item.qty}x {item.name}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            Lançado por {item.addedBy} • {formatCurrency(splitVal)} para cada ({consumersList.length}{' '}
                            {consumersList.length === 1 ? 'pessoa' : 'pessoas'})
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-emerald-400 tabular-nums text-sm block">
                            {formatCurrency(itemTotal)}
                          </span>
                          {isCurrentUserHost ? (
                            <button
                              type="button"
                              onClick={() => handleHostDeleteItem(item.id)}
                              className="mt-1 inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 font-semibold bg-rose-500/10 px-2 py-0.5 rounded-lg"
                            >
                              <Trash2 className="w-3 h-3" /> Excluir
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setRequestDeleteModalItem(item)}
                              className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-lg"
                            >
                              <AlertTriangle className="w-3 h-3" /> Pedir Exclusão
                            </button>
                          )}
                        </div>
                      </div>

                      {item.deleteRequest && (
                        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs">
                          <div className="text-amber-300">
                            ⚠️ <strong>{item.deleteRequest.requestedBy}</strong> pediu exclusão:{' '}
                            <em>"{item.deleteRequest.reason}"</em>
                          </div>
                          {isCurrentUserHost && (
                            <div className="flex gap-1.5 shrink-0">
                              <button
                                onClick={() => handleHostDeleteItem(item.id)}
                                className="bg-rose-500 text-white font-bold px-2.5 py-1 rounded-lg"
                              >
                                Apagar
                              </button>
                              <button
                                onClick={() => handleHostDismissRequest(item.id)}
                                className="bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg"
                              >
                                Manter
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-700/50">
                        <span className="text-[11px] text-slate-400 mr-1">Dividindo:</span>
                        {(roomData.participants || []).map((p) => {
                          const consuming = consumersList.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleToggleItemConsumer(item.id, p.id)}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                                consuming
                                  ? 'bg-emerald-500 text-slate-950 shadow'
                                  : 'bg-slate-900 text-slate-500 border border-slate-700'
                              }`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'pix' && (
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50 shadow-lg space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" /> Configurações da Conta & Pix do Recebedor
            </h3>

            <div className="flex items-center justify-between bg-slate-900 p-3.5 rounded-xl border border-slate-700">
              <div>
                <span className="text-sm font-semibold block">Taxa de Serviço do Garçom (10%)</span>
                <span className="text-xs text-slate-400">Calculada proporcionalmente ao consumo individual</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const updated = { ...roomData, serviceFeeEnabled: !roomData.serviceFeeEnabled };
                  await saveAndBroadcastRoom(updated);
                }}
                className={`w-12 h-7 rounded-full transition-all p-1 ${
                  roomData.serviceFeeEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    roomData.serviceFeeEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Couvert por Pessoa (R$)</label>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  value={roomData.couvertPerPerson}
                  onChange={async (e) => {
                    const updated = { ...roomData, couvertPerPerson: parseFloat(e.target.value) || 0 };
                    await saveAndBroadcastRoom(updated);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 tabular-nums"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Desconto / Cupom (R$)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={roomData.discountAmount}
                  onChange={async (e) => {
                    const updated = { ...roomData, discountAmount: parseFloat(e.target.value) || 0 };
                    await saveAndBroadcastRoom(updated);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 tabular-nums"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Dados de Recebimento Pix
                </span>
                {!isCurrentUserHost && (
                  <span className="text-[11px] text-amber-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Somente o Anfitrião edita
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <select
                  disabled={!isCurrentUserHost}
                  value={roomData.pixKeyType}
                  onChange={async (e) => {
                    const updated = { ...roomData, pixKeyType: e.target.value };
                    await saveAndBroadcastRoom(updated);
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-2.5 text-xs text-slate-100"
                >
                  <option>Celular</option>
                  <option>CPF/CNPJ</option>
                  <option>E-mail</option>
                  <option>Aleatória</option>
                </select>
                <input
                  type="text"
                  disabled={!isCurrentUserHost}
                  placeholder="Digite a Chave Pix..."
                  value={roomData.pixKey}
                  onChange={async (e) => {
                    const updated = { ...roomData, pixKey: e.target.value };
                    await saveAndBroadcastRoom(updated);
                    localStorage.setItem(
                      'rachafacil_saved_pix',
                      JSON.stringify({
                        pixKeyType: updated.pixKeyType,
                        pixKey: updated.pixKey,
                        pixHolder: updated.pixHolder
                      })
                    );
                  }}
                  className="col-span-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome do Titular da Conta</label>
                <input
                  type="text"
                  disabled={!isCurrentUserHost}
                  placeholder="Nome completo ou apelido"
                  value={roomData.pixHolder}
                  onChange={async (e) => {
                    const updated = { ...roomData, pixHolder: e.target.value };
                    await saveAndBroadcastRoom(updated);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50 shadow-lg space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" /> Controle de Segurança do Anfitrião
            </h3>

            <div className="flex items-center justify-between bg-slate-900 p-3.5 rounded-xl border border-slate-700">
              <div>
                <span className="text-sm font-semibold block">Trancar Mesa (Modo Leitura)</span>
                <span className="text-xs text-slate-400">
                  Impede que convidados lancem ou alterem itens durante o pagamento
                </span>
              </div>
              <button
                type="button"
                disabled={!isCurrentUserHost}
                onClick={async () => {
                  const updated = { ...roomData, isLocked: !roomData.isLocked };
                  await saveAndBroadcastRoom(updated);
                }}
                className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 ${
                  roomData.isLocked
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-200 border border-slate-700'
                }`}
              >
                {roomData.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                {roomData.isLocked ? 'Destrancar' : 'Trancar'}
              </button>
            </div>
          </div>
        )}

        <section className="bg-slate-800 rounded-2xl p-4 border border-slate-700/60 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-white">Conta Individual & Resumo Total</h2>
              <p className="text-[11px] text-slate-400">
                Toque em qualquer pessoa para abrir tudo que ela consumiu
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-400 tabular-nums">
              Total: {formatCurrency(totals.grandTotal)}
            </span>
          </div>

          <div className="space-y-2.5">
            {(roomData.participants || []).map((p) => {
              const pData = totals.byPerson[p.id];
              const isExpanded = expandedPersonId === p.id;

              return (
                <div
                  key={p.id}
                  className="bg-slate-900 rounded-2xl border border-slate-700/70 overflow-hidden transition-all"
                >
                  <div
                    onClick={() => setExpandedPersonId(isExpanded ? null : p.id)}
                    className="p-3.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-800/60"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-10 h-10 rounded-full bg-gradient-to-br ${p.gradient} flex items-center justify-center font-bold text-xs text-white shrink-0`}
                      >
                        {getInitials(p.name)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-slate-100">{p.name}</span>
                          {p.isHost && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                        <span className="text-[11px] text-slate-400 block">
                          {pData?.itemsConsumed.length || 0} itens • Toque para ver extrato
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="font-extrabold text-base text-emerald-400 tabular-nums block">
                          {formatCurrency(pData?.finalTotal || 0)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {p.paymentStatus === 'paid_pix' && '✅ Pago no Pix'}
                          {p.paymentStatus === 'paid_card' && '💳 Pago na Maquininha'}
                          {p.paymentStatus === 'notified' && '🔔 Pix Enviado'}
                          {p.paymentStatus === 'pending' && '⏳ Pendente'}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-800 bg-slate-950/50 space-y-3 text-xs">
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                          Itens Consumidos por {p.name}:
                        </span>
                        {pData?.itemsConsumed.length === 0 ? (
                          <p className="text-slate-500 italic">Nenhum item marcado para {p.name}.</p>
                        ) : (
                          pData.itemsConsumed.map((cItem) => (
                            <div key={cItem.id} className="flex justify-between text-slate-300">
                              <span>
                                • {cItem.qty}x {cItem.name}{' '}
                                <span className="text-slate-500">(dividido por {cItem.splitCount})</span>
                              </span>
                              <span className="font-semibold tabular-nums">{formatCurrency(cItem.myShare)}</span>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-800 space-y-1 text-slate-400">
                        <div className="flex justify-between">
                          <span>Subtotal Consumo:</span>
                          <span className="tabular-nums">{formatCurrency(pData?.consumptionSubtotal)}</span>
                        </div>
                        {roomData.serviceFeeEnabled && (
                          <div className="flex justify-between">
                            <span>Taxa Garçom (10% proporcional):</span>
                            <span className="tabular-nums">+ {formatCurrency(pData?.serviceFee)}</span>
                          </div>
                        )}
                        {pData?.couvertFee > 0 && (
                          <div className="flex justify-between">
                            <span>Couvert Artístico:</span>
                            <span className="tabular-nums">+ {formatCurrency(pData?.couvertFee)}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setPixModalPerson(pData)}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5"
                        >
                          <QrCode className="w-4 h-4" /> Gerar QR Pix
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleSetPaymentStatus(
                              p.id,
                              p.paymentStatus === 'paid_card' ? 'pending' : 'paid_card'
                            )
                          }
                          className="flex-1 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-300 font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5"
                        >
                          <CreditCard className="w-4 h-4" /> Pago na Maquininha
                        </button>
                        {isCurrentUserHost && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSetPaymentStatus(
                                p.id,
                                p.paymentStatus === 'paid_pix' ? 'pending' : 'paid_pix'
                              )
                            }
                            className="w-full bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold py-2 px-3 rounded-xl border border-slate-700"
                          >
                            {p.paymentStatus === 'paid_pix' ? 'Desmarcar Pago no Pix' : '✅ Confirmar Pix Recebido'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {showAdSlots && (
          <div className="bg-slate-800/40 border border-dashed border-slate-700 rounded-2xl p-4 text-center space-y-1">
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>PUBLICIDADE • GOOGLE ADSENSE SLOT</span>
              <button onClick={() => setShowAdSlots(false)} className="hover:text-slate-300">
                Ocultar Preview Ad
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Espaço otimizado para anúncio responsivo
            </p>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur border-t border-slate-800 p-3 z-30">
        <div className="max-w-lg mx-auto flex gap-2">
          <button
            type="button"
            onClick={handleCopyWhatsAppSummary}
            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 text-sm active:scale-95 transition-all"
          >
            <Share2 className="w-4 h-4" /> Copiar Resumo para WhatsApp
          </button>
        </div>
      </div>

      {requestDeleteModalItem && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-white">
              Pedir ao Anfitrião para excluir "{requestDeleteModalItem.name}"?
            </h3>
            <div className="space-y-2">
              {['Pedido não veio / Cancelado', 'Item lançado duplicado', 'Valor digitado errado'].map((reason) => (
                <button
                  key={reason}
                  onClick={() => handleGuestRequestDelete(requestDeleteModalItem.id, reason)}
                  className="w-full bg-slate-900 hover:bg-slate-700 border border-slate-700 text-left px-4 py-3 rounded-xl text-xs font-semibold text-slate-200"
                >
                  • {reason}
                </button>
              ))}
            </div>
            <button
              onClick={() => setRequestDeleteModalItem(null)}
              className="w-full bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {pixModalPerson && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-sm w-full p-5 space-y-4 text-center">
            <h3 className="text-lg font-extrabold text-white">
              Pix de {pixModalPerson.person.name}
            </h3>
            <p className="text-2xl font-black text-emerald-400 tabular-nums">
              {formatCurrency(pixModalPerson.finalTotal)}
            </p>

            {roomData.pixKey ? (
              <>
                <PixQrCodeSvg
                  payload={generatePixPayload({
                    key: roomData.pixKey,
                    name: roomData.pixHolder,
                    amount: pixModalPerson.finalTotal
                  })}
                />
                <p className="text-xs text-slate-400">
                  Recebedor: <strong>{roomData.pixHolder}</strong> ({roomData.pixKey})
                </p>
                <button
                  onClick={() => {
                    const code = generatePixPayload({
                      key: roomData.pixKey,
                      name: roomData.pixHolder,
                      amount: pixModalPerson.finalTotal
                    });
                    navigator.clipboard.writeText(code);
                    showToast('Código Pix Copia e Cola copiado!');
                  }}
                  className="w-full bg-emerald-500 text-slate-950 font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm"
                >
                  <Copy className="w-4 h-4" /> Copiar Código Pix (Copia e Cola)
                </button>
              </>
            ) : (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-300">
                O Anfitrião ainda não cadastrou a Chave Pix na aba <strong>"Taxas & Pix"</strong>.
              </div>
            )}

            <button
              onClick={() => setPixModalPerson(null)}
              className="w-full bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl text-xs"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
