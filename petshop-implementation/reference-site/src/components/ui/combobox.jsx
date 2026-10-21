import {animate} from 'motion';
import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import {Command as CommandPrimitive} from 'cmdk';
// shadcn/ui composition: Popover (Radix) + Command (cmdk).
function Chevron(){return <svg className="icon" viewBox="0 0 24 24"><path d="m8 9 4 4 4-4"/></svg>}
function Check(){return <svg className="icon" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>}
export function Combobox({select}){const [open,setOpen]=useState(false),[value,setValue]=useState(select.value);const options=Array.from(select.options);const label=select.closest('.field')?.querySelector('label')?.textContent||(select.id==='posClient'?'Selecionar cliente':'Selecionar opção');useEffect(()=>{const listener=()=>setValue(select.value);select.addEventListener('change',listener);return()=>select.removeEventListener('change',listener)},[select]);return <PopoverPrimitive.Root open={open} onOpenChange={setOpen}><PopoverPrimitive.Trigger asChild><button type="button" role="combobox" aria-expanded={open} aria-label={label} className="combo-trigger"><span>{options.find(o=>o.value===value)?.text||'Selecionar'}</span><Chevron/></button></PopoverPrimitive.Trigger><PopoverPrimitive.Portal container={select.closest('.modal')||document.body}><PopoverPrimitive.Content className="shadcn-popover" align="start" sideOffset={5} collisionPadding={12}><CommandPrimitive><div className="shadcn-command-input"><svg className="icon" viewBox="0 0 24 24"><path d="m21 21-6-6M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z"/></svg><CommandPrimitive.Input placeholder="Buscar opção…" aria-label="Buscar opção"/></div><CommandPrimitive.List><CommandPrimitive.Empty>Nenhuma opção encontrada.</CommandPrimitive.Empty><CommandPrimitive.Group>{options.map((option,index)=><CommandPrimitive.Item key={index} value={option.text+' '+index} disabled={option.disabled} onSelect={()=>{setValue(option.value);setOpen(false);select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}))}}><span>{option.text}</span>{value===option.value&&<Check/>}</CommandPrimitive.Item>)}</CommandPrimitive.Group></CommandPrimitive.List></CommandPrimitive></PopoverPrimitive.Content></PopoverPrimitive.Portal></PopoverPrimitive.Root>}
const roots=new Map();
window.cleanupComboboxes=()=>{for(const [node,root] of roots){root.unmount();roots.delete(node)}};
window.mountCombobox=(select)=>{const wrap=document.createElement('div');wrap.className='combo';select.parentNode.insertBefore(wrap,select);wrap.append(select);select.hidden=true;select.dataset.combo='true';const mount=document.createElement('div');mount.className='combo-mount';wrap.append(mount);const root=createRoot(mount);roots.set(mount,root);root.render(<Combobox select={select}/>)};
window.upgradeSelects=()=>{document.querySelectorAll('select:not([data-combo])').forEach(window.mountCombobox)};
window.upgradeSelects();

window.animatePage=(element)=>{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;animate(element,{opacity:[0.5,1],filter:['blur(5px)','blur(0px)'],y:[6,0]},{duration:0.25,ease:'easeOut'})};
