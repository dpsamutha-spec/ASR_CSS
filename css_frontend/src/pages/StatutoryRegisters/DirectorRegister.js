import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import Select from 'react-select';
import {Container,Modal,ModalBody,ModalHeader,Spinner} from 'reactstrap';
import {toast} from 'react-toastify';
import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import {AlignmentType,BorderStyle,Document,HeadingLevel,Packer,PageOrientation,Paragraph,ShadingType,Table,TableCell,TableLayoutType,TableRow,TextRun,WidthType} from 'docx';
import BreadCrumb from '../../Components/Common/BreadCrumb';
import DatePickerInput from '../../Components/Common/DatePickerInput';
import Pagination from '../../Components/Common/Pagination';
import useCollapseSidebar from '../../hooks/useCollapseSidebar';
import {getCompanyList,getOfficialList} from '../../helpers/backend_helper';
import './Statutory.css';

const EMPTY_FILTERS={companyId:'',fromDate:'',toDate:'',status:'ALL',dateBasis:'APPOINTMENT',recordStage:'ALL'};
const STATE_KEY='director-register-search-state';
const DIRECTOR_REGISTER_TABS=[
  {id:'SG',label:'Register of Director (SG)'},
  {id:'TRANSACTION',label:'Register of Director (SG) Transaction'},
  {id:'OFFSHORE',label:'Register of Director (Offshore)'}
];

const downloadBlob=(blob,filename)=>{
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const exportFilenamePart=value=>String(value||'directors').trim()
  .replace(/[<>:"/\\|?*]/g,'-').replace(/\s+/g,'-')||'directors';

const packParticularPairs=pairs=>{
  const rows=[];
  for(let index=0;index<pairs.length;index+=3){
    const cells=pairs.slice(index,index+3).flatMap(([label,value])=>[label,value]);
    while(cells.length<6) cells.push('');
    rows.push(cells);
  }
  return rows;
};

const loadState=()=>{
  if(typeof window==='undefined') return {};
  try{
    const saved=sessionStorage.getItem(STATE_KEY);
    return saved?JSON.parse(saved):{};
  }catch{return {};}
};

const selectStyles={
  control:(base,state)=>({...base,minHeight:38,borderColor:state.isFocused?'#405189':'var(--vz-border-color, #dfe3ea)',boxShadow:state.isFocused?'0 0 0 3px rgba(64,81,137,.1)':'none',background:'var(--vz-input-bg, var(--vz-card-bg, #fff))',fontSize:12.5,'&:hover':{borderColor:'#405189'}}),
  menu:base=>({...base,zIndex:20,fontSize:12.5}),
  singleValue:base=>({...base,color:'var(--vz-body-color)'}),
  placeholder:base=>({...base,color:'#9aa1ac'})
};

const unwrapList=response=>{
  const payload=response?.data??response;
  const list=payload?.data??payload??[];
  return Array.isArray(list)?list:[];
};

const mainDateOf=record=>record.date_record||(record.date_records||[]).find(x=>String(x.is_main_role)==='1')||(record.date_records||[])[0]||{};

const displayDate=value=>{
  if(!value) return '—';
  const [year,month,day]=String(value).slice(0,10).split('-').map(Number);
  if(!year||!month||!day) return value;
  return new Date(year,month-1,day).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
};

const formatAddress=(addresses=[])=>{
  const a=addresses.find(x=>x.is_primary)||addresses.find(x=>x.address_type==='REGISTERED')||addresses[0];
  if(!a) return '—';
  const unit=[a.level_no&&`#${a.level_no}`,a.unit_no].filter(Boolean).join('-');
  return [a.block_no,a.street_name,a.building_name,unit,a.city,a.state,a.postal_code,a.country].filter(Boolean).join(', ')||'—';
};

const CORPORATE_FIELDS=[
  {key:'uen_no',label:'UEN No.'},
  {key:'fbrn_reg_no',label:'FBRN'},
  {key:'uf_no',label:'UF No.'},
  {key:'domes_bus_no',label:'Domestic Business Number'},
  {key:'acra_no',label:'ACRA ID'}
];

const hasValue=value=>value!==null&&value!==undefined&&String(value).trim()!=='';

const roleLabel=record=>{
  const label=record.official_master?.official_master_name;
  if(label){
    if(/ies$/i.test(label)) return `${label.slice(0,-3)}y`;
    if(/s$/i.test(label)&&!/ss$/i.test(label)) return label.slice(0,-1);
    return label;
  }
  return String(record.official_master_slug||'').split('-').filter(Boolean)
    .map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');
};

const directorRoleKey=(entityId,officialEntityId)=>(
  entityId&&officialEntityId?`${entityId}:${officialEntityId}`:''
);

const directorEntityIds=record=>{
  if(record.official_entity_id) return [record.official_entity_id];
  return (record.joint_members||[]).map(member=>member.official_entity_id).filter(Boolean);
};

const resolveCorporateIdentification=(record,entity)=>{
  const ids=entity.identifications||[];
  const primary=ids.find(x=>x.is_primary);
  const sources=[record.identification,primary,...ids].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i);
  for(const field of CORPORATE_FIELDS){
    const source=sources.find(x=>hasValue(x[field.key]));
    if(source) return {type:field.label,number:String(source[field.key]).trim()};
  }
  const legacy=sources.find(x=>hasValue(x.id_number));
  return legacy?{type:'Registration Number',number:String(legacy.id_number).trim()}:{type:'Corporate Registration Number',number:'—'};
};

const getDirectorInfo=(record,directorPositions=[])=>{
  const entity=record.official_entity||{};
  const detail=entity.individual_detail||{};
  const companyDetail=entity.company_detail||{};
  const contacts=entity.contacts||[];
  const dates=mainDateOf(record);
  const ids=entity.identifications||[];
  const identification=record.identification||ids.find(x=>x.is_primary)||ids[0]||{};
  const isCorporate=record.official_type==='COMPANY';
  const corporateId=isCorporate?resolveCorporateIdentification(record,entity):null;
  const contact=type=>contacts.find(x=>x.contact_type===type);
  const phone=type=>{
    const c=contact(type);
    return c?.contact_value?[c.phone_country_code,c.contact_value].filter(Boolean).join(' '):'—';
  };
  return {
    company:record.entity?.name||'—',
    director:entity.name||'—',
    clientNo:entity.client_no||'',
    directorType:isCorporate?'Corporate':record.official_type==='JOINT'?'Joint':'Individual',
    directorPosition:directorPositions.join(', ')||roleLabel(record)||'Director',
    identificationType:isCorporate?corporateId.type:(identification.id_type?.id_name||'Identification'),
    identificationNo:isCorporate?corporateId.number:(identification.id_number||'—'),
    identificationExpiry:identification.id_expired_date||'',
    nationality:detail.member_nationality||companyDetail.country||'—',
    dob:detail.member_dob||companyDetail.company_incorporation_date||'',
    address:formatAddress(entity.addresses||[]),
    email:contact('EMAIL')?.contact_value||'—',
    mobile:phone('MOBILE'),
    telephone:phone('HOME'),
    office:phone('OFFICE'),
    appointmentDate:dates.appointment_date||'',
    cessationDate:dates.ceased_date||'',
    appointmentStage:Number(dates.is_appt_proposed)===1?'Proposed':'Effective',
    cessationStage:Number(dates.is_ceased_proposed)===1?'Proposed':'Effective',
    transactionRemarks:dates.remarks||'',
    status:Boolean(dates.ceased_date)||Number(record.is_current)===0?'Ceased':'Active',
    entryDate:record.created_date||''
  };
};

const DirectorRegister=()=>{
  useCollapseSidebar();
  const navigate=useNavigate();
  const [saved]=useState(loadState);
  const [companies,setCompanies]=useState([]);
  const [directors,setDirectors]=useState([]);
  const [officialRecords,setOfficialRecords]=useState([]);
  const [loading,setLoading]=useState(true);
  const [searching,setSearching]=useState(false);
  const [exporting,setExporting]=useState('');
  const [pdpaMode,setPdpaMode]=useState(saved.pdpaMode==='WITHOUT'?'WITHOUT':'WITH');
  const [filters,setFilters]=useState({...EMPTY_FILTERS,...(saved.filters||{})});
  const [appliedFilters,setAppliedFilters]=useState(saved.appliedFilters?{...EMPTY_FILTERS,...saved.appliedFilters}:null);
  const [tableSearch,setTableSearch]=useState(saved.tableSearch||'');
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(Number(saved.pageSize)||10);
  const [selectedDirector,setSelectedDirector]=useState(null);
  const [activeTab,setActiveTab]=useState('SG');

  document.title='Register of Directors | ASR CSS';

  const fetchData=useCallback(async()=>{
    setLoading(true);
    try{
      const [companiesRes,directorsRes,officialRes]=await Promise.all([
        getCompanyList({page:1,limit:1000,sort:'name',order:'ASC'}),
        getOfficialList({page:1,limit:2000,official_master_slug:'directors',is_ref_id:0,order:'created_date:DESC'}),
        getOfficialList({page:1,limit:2000,is_ref_id:0,order:'created_date:DESC'})
      ]);
      setCompanies(unwrapList(companiesRes));
      setDirectors(unwrapList(directorsRes));
      setOfficialRecords(unwrapList(officialRes));
    }catch(error){
      setCompanies([]);
      setDirectors([]);
      setOfficialRecords([]);
      toast.error(typeof error==='string'?error:'Unable to load the directors register');
    }finally{setLoading(false);}
  },[]);

  useEffect(()=>{fetchData();},[fetchData]);

  useEffect(()=>{
    if(typeof window==='undefined') return;
    if(!appliedFilters){sessionStorage.removeItem(STATE_KEY);return;}
    sessionStorage.setItem(STATE_KEY,JSON.stringify({pdpaMode,filters,appliedFilters,tableSearch,pageSize}));
  },[pdpaMode,filters,appliedFilters,tableSearch,pageSize]);

  const companyOptions=useMemo(()=>companies.map(x=>({
    value:String(x.entity_id),label:x.name,caption:x.client_no
  })),[companies]);

  // Match the owner register: show every active role held by this director for
  // the selected entity instead of relying only on the director's main role.
  const directorPositionsByEntity=useMemo(()=>{
    const positions=new Map();
    officialRecords.forEach(record=>{
      const slug=String(record.official_master_slug||record.official_master?.official_master_slug||'').toLowerCase();
      if(!record.official_entity_id||slug==='owners') return;
      const key=directorRoleKey(record.entity_id,record.official_entity_id);
      const label=roleLabel(record);
      if(!key||!label) return;
      if(!positions.has(key)) positions.set(key,new Set());
      positions.get(key).add(label);
    });
    return new Map([...positions].map(([key,labels])=>[key,[...labels]]));
  },[officialRecords]);

  const positionsForDirector=useCallback(record=>{
    const labels=directorEntityIds(record)
      .flatMap(officialEntityId=>directorPositionsByEntity.get(directorRoleKey(record.entity_id,officialEntityId))||[]);
    return [...new Set(labels)];
  },[directorPositionsByEntity]);

  const filteredRows=useMemo(()=>{
    if(!appliedFilters) return [];
    return directors.filter(record=>{
      const dates=mainDateOf(record);
      const info=getDirectorInfo(record,positionsForDirector(record));
      const dateValue=appliedFilters.dateBasis==='CESSATION'?dates.ceased_date:dates.appointment_date;
      const stage=appliedFilters.dateBasis==='CESSATION'
        ?(Number(dates.is_ceased_proposed)===1?'PROPOSED':'EFFECTIVE')
        :(Number(dates.is_appt_proposed)===1?'PROPOSED':'EFFECTIVE');
      if(appliedFilters.companyId&&String(record.entity_id)!==appliedFilters.companyId) return false;
      if(appliedFilters.status!=='ALL'&&info.status.toUpperCase()!==appliedFilters.status) return false;
      if(appliedFilters.recordStage!=='ALL'&&stage!==appliedFilters.recordStage) return false;
      if(appliedFilters.fromDate&&(!dateValue||dateValue<appliedFilters.fromDate)) return false;
      if(appliedFilters.toDate&&(!dateValue||dateValue>appliedFilters.toDate)) return false;
      if(tableSearch.trim()){
        const needle=tableSearch.trim().toLowerCase();
        const haystack=[info.company,info.director,info.clientNo,info.identificationNo,info.directorPosition,info.address,info.status].join(' ').toLowerCase();
        if(!haystack.includes(needle)) return false;
      }
      return true;
    });
  },[directors,appliedFilters,tableSearch,positionsForDirector]);

  useEffect(()=>setPage(1),[appliedFilters,tableSearch,pageSize,activeTab]);

  const pagedRows=useMemo(()=>{
    const start=(page-1)*pageSize;
    return filteredRows.slice(start,start+pageSize);
  },[filteredRows,page,pageSize]);

  const applySearch=()=>{
    if(!filters.companyId) return toast.error('Please select an entity name before searching');
    if(filters.fromDate&&filters.toDate&&filters.fromDate>filters.toDate) return toast.error('From date must be before or equal to To date');
    setSearching(true);
    setAppliedFilters({...filters});
    setTimeout(()=>setSearching(false),250);
  };

  const resetFilters=()=>{
    setFilters({...EMPTY_FILTERS});
    setAppliedFilters(null);
    setTableSearch('');
  };

  const selectedInfo=selectedDirector?getDirectorInfo(selectedDirector,positionsForDirector(selectedDirector)):null;
  const isTransactionTab=activeTab==='TRANSACTION';
  const tableColumnCount=isTransactionTab?12:(pdpaMode==='WITH'?11:8);

  const selectRegisterTab=tabId=>{
    setActiveTab(tabId);
    setPage(1);
    setSelectedDirector(null);
  };

  const directorParticularRows=record=>{
    const info=getDirectorInfo(record,positionsForDirector(record));
    const present=value=>value||'—';
    const dated=value=>value?displayDate(value):'—';
    const pairs=pdpaMode==='WITHOUT'
      ? [['Full Name / Entity Name',info.director],['Director Position',info.directorPosition],['Date of Appointment',dated(info.appointmentDate)],['Date of Cessation',dated(info.cessationDate)],['Entry Date',dated(info.entryDate)],['Status',info.status]]
      : [['Full Name / Entity Name',info.director],['Identification Type',present(info.identificationType)],['Date of Appointment',dated(info.appointmentDate)],['Residential Address',present(info.address)],['Identification Value',present(info.identificationNo)],['Date of Cessation',dated(info.cessationDate)],['Date of Birth',dated(info.dob)],['Nationality / Country',present(info.nationality)],['ID Expiry Date',dated(info.identificationExpiry)],['Email Address',present(info.email)],['Mobile Number',present(info.mobile)],['Telephone Number',present(info.telephone)],['Office Number',present(info.office)],['Director Position',info.directorPosition],['Status',info.status]];
    return packParticularPairs(pairs);
  };
  const exportHeaders=isTransactionTab
    ? ['Entity','Director','Transaction Date','Transaction Type','Affected Role / Position','Old Value','New Value','Stage','Reference / Remarks','Recorded By / Date','Status']
    : ['Entity','Director','Type','Identification','Director Position',activeTab==='OFFSHORE'?'Nationality / Incorporation':'Nationality / DOB','Address','Appointment','Cessation','Status'];
  const exportRows=filteredRows.map(record=>{
    const info=getDirectorInfo(record,positionsForDirector(record));
    if(isTransactionTab){
      const cessation=Boolean(info.cessationDate);
      const type=info.transactionRemarks||(info.appointmentDate&&info.cessationDate?'Appointment and cessation':cessation?'Cessation / resignation':info.appointmentDate?'Appointment':'Particulars update');
      const recordedBy=record.created_by?`User #${record.created_by}`:'Not recorded';
      const recordedDate=info.entryDate?displayDate(info.entryDate):'Not recorded';
      return [info.company,info.director,displayDate(cessation?info.cessationDate:info.appointmentDate),type,info.directorPosition,'Not recorded',info.directorPosition,cessation?info.cessationStage:info.appointmentStage,info.transactionRemarks||'Not recorded',`${recordedBy} · ${recordedDate}`,info.status];
    }
    return [info.company,info.director,info.directorType,`${info.identificationType}: ${info.identificationNo}`,info.directorPosition,`${info.nationality} / ${info.dob?displayDate(info.dob):'—'}`,info.address,displayDate(info.appointmentDate),displayDate(info.cessationDate),info.status];
  });
  const exportBaseName=`${exportFilenamePart(DIRECTOR_REGISTER_TABS.find(tab=>tab.id===activeTab)?.label)}-${new Date().toISOString().slice(0,10)}`;

  const handlePdfDownload=()=>{
    if(!appliedFilters) return toast.info('Search for an entity before downloading');
    if(!exportRows.length) return toast.info('There are no director records to export');
    setExporting('PDF');
    try{
      const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
      const generationDate=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
      const firstEntity=filteredRows[0]?.entity||{};
      const registration=resolveCorporateIdentification({},firstEntity);
      const uen=registration.number!=='â€”'?registration.number:(firstEntity.client_no||'â€”');
      const drawHeader=addPage=>{
        if(addPage) pdf.addPage('a4','landscape');
        pdf.setTextColor(20,20,20); pdf.setFont('times','bold'); pdf.setFontSize(15); pdf.text('REGISTER OF DIRECTORS',148.5,17,{align:'center'});
        pdf.setFont('times','italic'); pdf.setFontSize(7.5); pdf.text(`Prepared as at ${generationDate}`,148.5,23,{align:'center'});
        autoTable(pdf,{startY:29,body:[[{content:`ENTITY NAME:  ${firstEntity.name||'â€”'}`,styles:{fontStyle:'bold'}},{content:`UEN / REGISTRATION NO.:  ${uen}`,styles:{fontStyle:'bold'}}]],theme:'grid',tableWidth:277,margin:{left:10,right:10},styles:{font:'times',fontSize:8.5,cellPadding:3,lineColor:[25,25,25],lineWidth:.35,textColor:[20,20,20]},columnStyles:{0:{cellWidth:138.5},1:{cellWidth:138.5}}});
        pdf.setFont('times','italic'); pdf.setFontSize(7); pdf.setTextColor(90,90,90); pdf.text(pdpaMode==='WITH'?'CONFIDENTIAL — This copy contains personal particulars.':'PDPA-REDACTED COPY — Personal particulars are omitted.',10,pdf.lastAutoTable.finalY+5);
        return pdf.lastAutoTable.finalY+10;
      };
      let cursorY=drawHeader(false);
      filteredRows.forEach((record,index)=>{
        const info=getDirectorInfo(record,positionsForDirector(record));
        if(cursorY>155) cursorY=drawHeader(true);
        pdf.setFillColor(238,240,244); pdf.rect(10,cursorY,277,7,'F'); pdf.setDrawColor(25,25,25); pdf.rect(10,cursorY,277,7);
        pdf.setTextColor(20,20,20); pdf.setFont('times','bold'); pdf.setFontSize(8); pdf.text(`DIRECTOR ${String(index+1).padStart(2,'0')}  —  ${info.director.toUpperCase()}  (${info.directorType.toUpperCase()})`,13,cursorY+4.7);
        autoTable(pdf,{startY:cursorY+7,body:directorParticularRows(record),theme:'grid',tableWidth:277,margin:{left:10,right:10,bottom:16},pageBreak:'avoid',styles:{font:'times',fontSize:7.4,cellPadding:2.2,minCellHeight:8,valign:'middle',lineColor:[25,25,25],lineWidth:.25,textColor:[20,20,20]},columnStyles:{0:{cellWidth:31,fillColor:[247,247,247],fontStyle:'bold'},1:{cellWidth:61},2:{cellWidth:31,fillColor:[247,247,247],fontStyle:'bold'},3:{cellWidth:61},4:{cellWidth:31,fillColor:[247,247,247],fontStyle:'bold'},5:{cellWidth:62}}});
        cursorY=pdf.lastAutoTable.finalY+9;
      });
      const totalPages=pdf.getNumberOfPages();
      for(let pageNo=1;pageNo<=totalPages;pageNo+=1){pdf.setPage(pageNo);pdf.setDrawColor(175,175,175);pdf.line(10,198,287,198);pdf.setFont('times','normal');pdf.setTextColor(90,90,90);pdf.setFontSize(7);pdf.text(`Generated by ASR CSS on ${generationDate}`,10,203);pdf.text(`Page ${pageNo} of ${totalPages}`,287,203,{align:'right'});}
      pdf.save(`${exportBaseName}.pdf`);
      toast.success('Directors register PDF downloaded');
    }catch{toast.error('Unable to generate the PDF');}
    finally{setExporting('');}
  };

  const handleDocxDownload=async()=>{
    if(!appliedFilters) return toast.info('Search for an entity before downloading');
    if(!exportRows.length) return toast.info('There are no director records to export');
    setExporting('DOCX');
    try{
      const generationDate=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
      const entity=filteredRows[0]?.entity||{};
      const registration=resolveCorporateIdentification({},entity);
      const uen=registration.number!=='â€”'?registration.number:(entity.client_no||'â€”');
      const borders={top:{style:BorderStyle.SINGLE,size:5,color:'222222'},bottom:{style:BorderStyle.SINGLE,size:5,color:'222222'},left:{style:BorderStyle.SINGLE,size:5,color:'222222'},right:{style:BorderStyle.SINGLE,size:5,color:'222222'},insideHorizontal:{style:BorderStyle.SINGLE,size:5,color:'222222'},insideVertical:{style:BorderStyle.SINGLE,size:5,color:'222222'}};
      const contentWidth=15758,headerWidths=[2206,5673,2836,5043],detailWidths=[1891,3362,1891,3361,1891,3362];
      const styledCell=(text,{label=false,width,fill}={})=>new TableCell({width:{size:width,type:WidthType.DXA},borders,margins:{top:90,right:100,bottom:90,left:100},shading:label||fill?{type:ShadingType.CLEAR,fill:fill||'F3F4F6',color:'auto'}:undefined,children:[new Paragraph({spacing:{before:0,after:0},children:[new TextRun({text:text===null||text===undefined?'â€”':String(text),bold:label,size:label?18:17,color:'111111'})]})]});
      const children=[new Paragraph({heading:HeadingLevel.TITLE,alignment:AlignmentType.CENTER,spacing:{after:80},children:[new TextRun({text:'REGISTER OF DIRECTORS',bold:true,size:30,font:'Times New Roman',color:'111111'})]}),new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:260},children:[new TextRun({text:`Prepared as at ${generationDate}`,italics:true,size:17,font:'Times New Roman',color:'555555'})]}),new Table({width:{size:contentWidth,type:WidthType.DXA},columnWidths:headerWidths,layout:TableLayoutType.FIXED,rows:[new TableRow({cantSplit:true,children:[styledCell('ENTITY NAME',{label:true,width:headerWidths[0]}),styledCell(entity.name||'â€”',{width:headerWidths[1]}),styledCell('UEN / REGISTRATION NO.',{label:true,width:headerWidths[2]}),styledCell(uen,{width:headerWidths[3]})]})]}),new Paragraph({spacing:{before:100,after:200},children:[new TextRun({text:pdpaMode==='WITH'?'CONFIDENTIAL â€” This copy contains personal particulars.':'PDPA-REDACTED COPY â€” Personal particulars are omitted.',italics:true,size:16,color:'666666',font:'Times New Roman'})]})];
      filteredRows.forEach((record,index)=>{const info=getDirectorInfo(record,positionsForDirector(record));children.push(new Table({width:{size:contentWidth,type:WidthType.DXA},columnWidths:[contentWidth],layout:TableLayoutType.FIXED,rows:[new TableRow({cantSplit:true,children:[styledCell(`DIRECTOR ${String(index+1).padStart(2,'0')} â€” ${info.director.toUpperCase()} (${info.directorType.toUpperCase()})`,{width:contentWidth,fill:'E5E7EB'})]})]}),new Table({width:{size:contentWidth,type:WidthType.DXA},columnWidths:detailWidths,layout:TableLayoutType.FIXED,rows:directorParticularRows(record).map(row=>new TableRow({cantSplit:true,children:row.map((value,column)=>styledCell(value,{label:column%2===0,width:detailWidths[column]}))}))}),new Paragraph({spacing:{after:220},children:[]}));});
      const styledDocument=new Document({sections:[{properties:{page:{size:{orientation:PageOrientation.LANDSCAPE},margin:{top:720,right:540,bottom:720,left:540}}},children}]});
      downloadBlob(await Packer.toBlob(styledDocument),`${exportBaseName}.docx`);
      toast.success('Directors register DOCX downloaded');
      return;
      const cell=(text,bold=false)=>new TableCell({children:[new Paragraph({children:[new TextRun({text:String(text||'—'),bold,size:16})]})]});
      const document=new Document({sections:[{children:[
        new Paragraph({children:[new TextRun({text:DIRECTOR_REGISTER_TABS.find(tab=>tab.id===activeTab)?.label.toUpperCase(),bold:true,size:28})]}),
        new Paragraph({children:[new TextRun({text:`Prepared on ${new Date().toLocaleDateString('en-GB')}`,italics:true,size:16})]}),
        new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[
          new TableRow({children:exportHeaders.map(header=>cell(header,true))}),
          ...exportRows.map(row=>new TableRow({children:row.map(value=>cell(value))}))
        ]})
      ]}]});
      downloadBlob(await Packer.toBlob(document),`${exportBaseName}.docx`);
      toast.success('Directors register DOCX downloaded');
    }catch{toast.error('Unable to generate the DOCX file');}
    finally{setExporting('');}
  };

  return <div className="page-content owner-register-page">
    <Container fluid>
      <BreadCrumb title="Register of Directors" pageTitle="Statutory Registers"/>
      <section className="or-hero">
        <div className="or-hero-icon"><i className="ri-user-star-line"/></div>
        <div className="or-hero-copy">
          <h2>Register of Directors</h2>
          <p>View current and historical director records.</p>
        </div>
      </section>

      <section className="or-filter-card">
        <div className="or-filter-toolbar">
          <div className="or-visibility-control">
            <span className="or-visibility-label">Data visibility <i className="ri-information-line"/></span>
            <div className="or-segmented" role="group">
              <button type="button" className={pdpaMode==='WITH'?'active':''} onClick={()=>setPdpaMode('WITH')}>
                <i className="ri-shield-check-line"/> With PDPA
              </button>
              <button type="button" className={pdpaMode==='WITHOUT'?'active':''} onClick={()=>setPdpaMode('WITHOUT')}>
                <i className="ri-eye-off-line"/> Without PDPA
              </button>
            </div>
            <nav className="director-register-tabs" aria-label="Director register type">
              {DIRECTOR_REGISTER_TABS.map(tab=><button key={tab.id} type="button"
                className={activeTab===tab.id?'active':''} onClick={()=>selectRegisterTab(tab.id)}>
                {tab.label}
              </button>)}
            </nav>
          </div>
          <button type="button" className="or-reset-btn" onClick={resetFilters}><i className="ri-refresh-line"/> Reset filters</button>
        </div>

        <div className="or-filter-grid">
          <div className="or-field or-span-2">
            <label>Entity <span className="text-danger">*</span></label>
            <Select isClearable isSearchable styles={selectStyles} options={companyOptions}
              value={companyOptions.find(x=>x.value===filters.companyId)||null}
              onChange={option=>setFilters(x=>({...x,companyId:option?.value||''}))}
              placeholder="Select entity name"
              formatOptionLabel={option=><div className="or-option"><span>{option.label}</span>{option.caption&&<small>{option.caption}</small>}</div>}/>
          </div>

          <div className="or-field">
            <label>Date basis</label>
            <select value={filters.dateBasis} onChange={e=>setFilters(x=>({...x,dateBasis:e.target.value}))}>
              <option value="APPOINTMENT">Appointment date</option>
              <option value="CESSATION">Cessation date</option>
            </select>
          </div>

          <div className="or-field">
            <label>From date</label>
            <DatePickerInput value={filters.fromDate} onChange={e=>setFilters(x=>({...x,fromDate:e.target.value}))} placeholder="DD/MM/YYYY"/>
          </div>

          <div className="or-field">
            <label>To date</label>
            <DatePickerInput value={filters.toDate} onChange={e=>setFilters(x=>({...x,toDate:e.target.value}))} placeholder="DD/MM/YYYY"/>
          </div>

          <div className="or-field">
            <label>Status</label>
            <select value={filters.status} onChange={e=>setFilters(x=>({...x,status:e.target.value}))}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="CEASED">Ceased</option>
            </select>
          </div>

          <div className="or-field">
            <label>Record stage</label>
            <select value={filters.recordStage} onChange={e=>setFilters(x=>({...x,recordStage:e.target.value}))}>
              <option value="ALL">All stages</option>
              <option value="EFFECTIVE">Effective</option>
              <option value="PROPOSED">Proposed</option>
            </select>
          </div>

          <div className="or-filter-action">
            <button type="button" className="or-search-btn" onClick={applySearch} disabled={loading||searching}>
              {searching?<Spinner size="sm"/>:<i className="ri-search-2-line"/>} Search
            </button>
          </div>
          <div className="or-filter-downloads">
            <button type="button" className="or-inline-export pdf" onClick={handlePdfDownload} disabled={loading||Boolean(exporting)||!appliedFilters||exportRows.length===0}>
              {exporting==='PDF'?<Spinner size="sm"/>:<i className="ri-file-pdf-2-line"/>} Download PDF
            </button>
            <button type="button" className="or-inline-export docx" onClick={handleDocxDownload} disabled={loading||Boolean(exporting)||!appliedFilters||exportRows.length===0}>
              {exporting==='DOCX'?<Spinner size="sm"/>:<i className="ri-file-word-2-line"/>} Download DOCX
            </button>
          </div>
        </div>
      </section>

      <section className="or-results-card">
        <div className="or-results-toolbar">
          <div className="or-results-heading">
            <h5>{DIRECTOR_REGISTER_TABS.find(tab=>tab.id===activeTab)?.label}</h5>
            <span>{!appliedFilters?'Search to view records':loading?'Loading…':`${filteredRows.length} record${filteredRows.length===1?'':'s'}`}</span>
          </div>
          <div className="or-table-tools">
            <div className="or-table-search">
              <i className="ri-search-line"/>
              <input value={tableSearch} onChange={e=>setTableSearch(e.target.value)} placeholder="Search directors..."/>
            </div>
            <label>Show
              <select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>
                {[10,25,50,100].map(size=><option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="or-table-wrap">
          <table className="or-table">
            <thead><tr>
              <th>Entity</th>
              <th>Director</th>
              {!isTransactionTab&&<th>Director Position</th>}
              {isTransactionTab? <>
                <th>Transaction Date</th><th>Transaction Type</th><th>Affected Role / Position</th><th>Old Value</th><th>New Value</th><th>Stage</th><th>Reference / Remarks</th><th>Recorded By / Date</th>
              </> : <>
                <th>Type</th>
                {pdpaMode==='WITH'&&<th>Identification</th>}
                {pdpaMode==='WITH'&&<><th>{activeTab==='OFFSHORE'?'Nationality / Incorporation':'Nationality / DOB'}</th><th>Address</th></>}
              </>}
              {!isTransactionTab&&<><th>Appointment</th><th>Cessation</th></>}
              <th>Status</th>
              <th className="or-actions-heading">Actions</th>
            </tr></thead>

            <tbody>
              {!appliedFilters?(
                <tr><td colSpan={tableColumnCount}>
                  <div className="or-empty"><span><i className="ri-search-2-line"/></span><h5>Search to view director records</h5><p>Select an entity and click Search.</p></div>
                </td></tr>
              ):loading?[...Array(6)].map((_,i)=>(
                <tr key={i} className="or-skeleton-row">{[...Array(tableColumnCount)].map((_,j)=><td key={j}><span/></td>)}</tr>
              )):pagedRows.length===0?(
                <tr><td colSpan={tableColumnCount}>
                  <div className="or-empty"><span><i className="ri-file-search-line"/></span><h5>No director records found</h5><p>Adjust the register filters and try your search again.</p></div>
                </td></tr>
              ):pagedRows.map(record=>{
                const info=getDirectorInfo(record,positionsForDirector(record));
                const editPath=`/officials/${record.official_master_slug||'directors'}/edit/${record.official_id}`;
                const cessation=Boolean(info.cessationDate);
                const transactionType=info.transactionRemarks||(info.appointmentDate&&info.cessationDate?'Appointment and cessation':cessation?'Cessation / resignation':info.appointmentDate?'Appointment':'Particulars update');
                const transactionDate=cessation?info.cessationDate:info.appointmentDate;
                const transactionStage=cessation?info.cessationStage:info.appointmentStage;
                return <tr key={record.official_id}>
                  <td><div className="or-company-cell"><div><strong>{info.company}</strong><small>{record.entity?.client_no||'Entity'}</small></div></div></td>
                  <td><div className="or-owner-cell"><strong>{info.director}</strong>{info.clientNo&&<small>{info.clientNo}</small>}</div></td>
                  {!isTransactionTab&&<td><div className="or-position-tags"><span>{info.directorPosition}</span></div></td>}
                  {isTransactionTab? <>
                    <td><div className="or-date-cell"><strong>{displayDate(transactionDate)}</strong></div></td>
                    <td><strong>{transactionType}</strong></td>
                    <td><div className="or-position-tags"><span>{info.directorPosition}</span></div></td>
                    <td><span className="or-muted-value">Not recorded</span></td>
                    <td><span>{info.directorPosition}</span></td>
                    <td><small className={`or-transaction-stage ${transactionStage.toLowerCase()}`}>{transactionStage}</small></td>
                    <td><span className="or-transaction-remarks">{info.transactionRemarks||'Not recorded'}</span></td>
                    <td><div className="or-detail-cell"><small>{record.created_by?`User #${record.created_by}`:'Not recorded'}</small><strong>{info.entryDate?displayDate(info.entryDate):'Not recorded'}</strong></div></td>
                  </> : <>
                    <td><span className={`or-type-badge ${info.directorType.toLowerCase()}`}>
                      <i className={info.directorType==='Corporate'?'ri-building-line':info.directorType==='Joint'?'ri-group-line':'ri-user-line'}/>{info.directorType}
                    </span></td>
                    {pdpaMode==='WITH'&&<td><div className="or-detail-cell"><small>{info.identificationType}</small><strong>{info.identificationNo}</strong></div></td>}
                    {pdpaMode==='WITH'&&<>
                      <td><div className="or-detail-cell"><strong>{info.nationality}</strong><small>{info.dob?displayDate(info.dob):'Date not recorded'}</small></div></td>
                      <td><span className="or-address" title={info.address}>{info.address}</span></td>
                    </>}
                  </>}
                  {!isTransactionTab&&<>
                    <td><div className="or-date-cell"><strong>{displayDate(info.appointmentDate)}</strong><small className={info.appointmentStage.toLowerCase()}>{info.appointmentStage}</small></div></td>
                    <td><div className="or-date-cell"><strong>{displayDate(info.cessationDate)}</strong>{info.cessationDate&&<small className={info.cessationStage.toLowerCase()}>{info.cessationStage}</small>}</div></td>
                  </>}
                  <td><span className={`or-status ${info.status.toLowerCase()}`}><i/>{info.status}</span></td>
                  <td className="or-actions-cell">
                    <button type="button" className="or-action-button" title="View director" onClick={()=>setSelectedDirector(record)}><i className="ri-eye-line"/></button>
                    <button type="button" className="or-action-button" title="Edit director record" onClick={()=>navigate(editPath)}><i className="ri-edit-line"/></button>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>

        {!loading&&filteredRows.length>0&&<div className="or-pagination">
          <span>Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize,filteredRows.length)} of {filteredRows.length}</span>
          <Pagination total={filteredRows.length} currentPage={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize}/>
        </div>}
      </section>
    </Container>

    <Modal isOpen={Boolean(selectedDirector)} toggle={()=>setSelectedDirector(null)} centered size="lg" className="director-details-modal">
      <ModalHeader toggle={()=>setSelectedDirector(null)}>
        <div className="or-modal-title"><span>Director Details</span><small>{selectedInfo?.company} · {selectedDirector?.entity?.client_no||'Entity'}</small></div>
      </ModalHeader>
      <ModalBody>
        {selectedInfo&&<>
          <div className="or-modal-summary">
            <div className="or-modal-owner-icon"><i className={selectedInfo.directorType==='Corporate'?'ri-building-line':'ri-user-line'}/></div>
            <div className="or-modal-owner-name"><strong>{selectedInfo.director}</strong><span>{selectedInfo.clientNo||selectedInfo.directorType}</span></div>
            <span className={`or-type-badge ${selectedInfo.directorType.toLowerCase()}`}>{selectedInfo.directorType}</span>
            <span className={`or-status ${selectedInfo.status.toLowerCase()}`}><i/>{selectedInfo.status}</span>
          </div>

          {pdpaMode==='WITHOUT'&&<div className="or-modal-pdpa-note"><i className="ri-eye-off-line"/> Personal particulars are omitted in Without PDPA mode.</div>}

          <div className="or-modal-details">
            <div className="or-modal-detail"><span>Full Name</span><strong>{selectedInfo.director}</strong></div>
            <div className="or-modal-detail"><span>Director Position</span><strong>{selectedInfo.directorPosition}</strong></div>
            {pdpaMode==='WITH'&&<>
              <div className="or-modal-detail"><span>Identification Type</span><strong>{selectedInfo.identificationType}</strong></div>
              <div className="or-modal-detail"><span>Identification Value</span><strong>{selectedInfo.identificationNo}</strong></div>
              <div className="or-modal-detail"><span>Nationality</span><strong>{selectedInfo.nationality}</strong></div>
              <div className="or-modal-detail"><span>Date of Birth</span><strong>{displayDate(selectedInfo.dob)}</strong></div>
              <div className="or-modal-detail"><span>Residential Address</span><strong>{selectedInfo.address}</strong></div>
              <div className="or-modal-detail"><span>Email Address</span><strong>{selectedInfo.email}</strong></div>
              <div className="or-modal-detail"><span>Mobile Number</span><strong>{selectedInfo.mobile}</strong></div>
            </>}
            <div className="or-modal-detail"><span>Date of Appointment</span><strong>{displayDate(selectedInfo.appointmentDate)}</strong></div>
            <div className="or-modal-detail"><span>Appointment Stage</span><strong>{selectedInfo.appointmentStage}</strong></div>
            <div className="or-modal-detail"><span>Date of Cessation</span><strong>{displayDate(selectedInfo.cessationDate)}</strong></div>
            <div className="or-modal-detail"><span>Status</span><strong>{selectedInfo.status}</strong></div>
          </div>
        </>}
      </ModalBody>
    </Modal>
  </div>;
};

export default DirectorRegister;
